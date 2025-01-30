/* eslint-disable @typescript-eslint/no-explicit-any */
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';

const stripe = new Stripe(functions.config().stripe.secret_key, {
  apiVersion: '2025-01-27.acacia',
});

const db = admin.firestore();

interface CartItem {
  name: string;
  price: number;
  quantity: number;
  image: string;
}

interface PaymentSessionRestaurant {
  restaurantId: string;
  stripeAccountId: string;
  amount: number;
  items: CartItem[];
}

interface PaymentSession {
  id: string;
  restaurants: PaymentSessionRestaurant[];
  status: 'pending' | 'completed' | 'failed';
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
  userId: string;
  checkoutSessionId: string;
}

export const createCheckoutSession = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { restaurants, successUrl, cancelUrl } = data;
  const userId = context.auth.uid;

  try {
    // Validate all restaurants first
    await Promise.all(
      restaurants.map(async (restaurant: { items: any[]; restaurantId: string; amount: any; stripeAccountId: any }) => {
        const restaurantRef = db.doc('restaurants/' + restaurant.restaurantId);
        const restaurantDoc = await restaurantRef.get();

        if (!restaurantDoc.exists) {
          throw new functions.https.HttpsError('not-found', `Restaurant ${restaurant.restaurantId} not found`);
        }
        const data = restaurantDoc.data();
        if (!data?.stripeAccountId) {
          throw new functions.https.HttpsError('failed-precondition', `Restaurant ${restaurant.restaurantId} is not setup for payments`);
        }
        // Add stripeAccountId to the restaurant data for later use
        restaurant.stripeAccountId = data.stripeAccountId;
      }),
    );

    const paymentSessionRef = db.collection('paymentSessions').doc();
    const paymentSession: PaymentSession = {
      id: paymentSessionRef.id,
      restaurants,
      status: 'pending',
      createdAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now(),
      userId,
      checkoutSessionId: '',
    };

    // Calculate total amount
    // const totalAmount = restaurants.reduce((sum: any, restaurant: { amount: any }) => sum + restaurant.amount, 0);

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl,
      payment_intent_data: {
        transfer_group: paymentSessionRef.id,
      },
      metadata: {
        paymentSessionId: paymentSessionRef.id,
        userId,
      },
      line_items: restaurants.flatMap((restaurant: { items: any[] }) =>
        restaurant.items.map((item: { name: any; image: any; price: number; quantity: any }) => ({
          price_data: {
            currency: 'eur',
            product_data: {
              name: item.name,
              images: [item.image],
            },
            unit_amount: Math.round(item.price * 100), // Convert to cents
          },
          quantity: item.quantity,
        })),
      ),
    });

    // Update payment session with checkout session ID
    paymentSession.checkoutSessionId = session.id;
    await paymentSessionRef.set(paymentSession);

    return { sessionId: session.id };
  } catch (error) {
    console.error('Error creating checkout session:', error);
    throw new functions.https.HttpsError('internal', 'Unable to create checkout session');
  }
});

export const handleStripeWebhook = functions.https.onRequest(async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = functions.config().stripe.webhook_secret;

  if (!sig || !endpointSecret) {
    console.error('Missing stripe signature or endpoint secret');
    res.status(400).send('Missing stripe signature or endpoint secret');
    return;
  }

  try {
    const event = stripe.webhooks.constructEvent(req.rawBody, sig, endpointSecret);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const { paymentSessionId } = session.metadata!;

      // Ensure idempotency - check if payment was already processed
      const paymentSessionRef = db.collection('paymentSessions').doc(paymentSessionId);
      const paymentSessionSnap = await paymentSessionRef.get();
      const paymentSession = paymentSessionSnap.data() as PaymentSession;

      if (!paymentSessionSnap.exists) {
        throw new Error('Payment session not found');
      }

      if (paymentSession.status === 'completed') {
        console.log('Payment already processed, skipping');
        res.json({ received: true });
        return;
      }

      // Start a transaction to ensure atomic updates
      await db.runTransaction(async (transaction) => {
        // Update payment session status first
        transaction.update(paymentSessionRef, {
          status: 'completed',
          updatedAt: admin.firestore.Timestamp.now(),
        });

        // Create orders for each restaurant
        const orderRefs = paymentSession.restaurants.map((restaurant) => {
          const orderRef = db.collection('orders').doc();
          const order = {
            id: orderRef.id,
            userId: paymentSession.userId,
            restaurantId: restaurant.restaurantId,
            items: restaurant.items,
            amount: restaurant.amount,
            status: 'pending',
            paymentSessionId,
            createdAt: admin.firestore.Timestamp.now(),
            updatedAt: admin.firestore.Timestamp.now(),
          };
          transaction.set(orderRef, order);
          return orderRef;
        });

        return orderRefs;
      });

      // After transaction succeeds, process Stripe transfers
      await Promise.all(
        paymentSession.restaurants.map(async (restaurant) => {
          try {
            await stripe.transfers.create({
              amount: Math.round(restaurant.amount * 100),
              currency: 'eur',
              destination: restaurant.stripeAccountId,
              transfer_group: paymentSessionId,
            });
          } catch (error) {
            console.error(`Failed to transfer to restaurant ${restaurant.restaurantId}:`, error);
            // Consider adding a retry mechanism or notification system here
          }
        }),
      );
    }

    res.json({ received: true });
  } catch (error: any) {
    console.error('Webhook error:', error);
    // Don't expose internal error details in production
    res.status(400).send('Webhook Error');
  }
});
