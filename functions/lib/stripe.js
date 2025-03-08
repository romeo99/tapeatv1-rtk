"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleStripeWebhook = exports.createStripeConnectAccount = exports.createCheckoutSession = void 0;
/* eslint-disable @typescript-eslint/no-explicit-any */
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const stripe_1 = __importDefault(require("stripe"));
const stripe = new stripe_1.default(functions.config().stripe.secret_key, {
    apiVersion: '2025-01-27.acacia',
});
const db = admin.firestore();
exports.createCheckoutSession = functions.https.onCall(async (data, context) => {
    /* if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    } */
    const { restaurants, successUrl, cancelUrl, fees, method } = data;
    //const userId = context.auth.uid;
    const userId = '123'; // For testing purposes
    try {
        // Validate all restaurants first
        await Promise.all(restaurants.map(async (restaurant) => {
            const restaurantRef = db.doc('restaurants/' + restaurant.restaurantId);
            const restaurantDoc = await restaurantRef.get();
            if (!restaurantDoc.exists) {
                throw new functions.https.HttpsError('not-found', `Restaurant ${restaurant.restaurantId} not found`);
            }
            const data = restaurantDoc.data();
            if (!(data === null || data === void 0 ? void 0 : data.stripeAccountId)) {
                throw new functions.https.HttpsError('failed-precondition', `Restaurant ${restaurant.restaurantId} is not setup for payments`);
            }
            // Add stripeAccountId to the restaurant data for later use
            restaurant.stripeAccountId = data.stripeAccountId;
        }));
        const paymentSessionRef = db.collection('paymentSessions').doc();
        const paymentSession = {
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
            payment_method_types: [method],
            allow_promotion_codes: true,
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
            line_items: [
                ...restaurants.flatMap((restaurant) => restaurant.items.map((item) => ({
                    price_data: {
                        currency: 'eur',
                        product_data: {
                            name: item.name,
                            images: [item.image],
                        },
                        unit_amount: Math.round(item.price * 100), // Convert to cents
                    },
                    quantity: item.quantity,
                }))),
                // Add service fees as a separate line item
                {
                    price_data: {
                        currency: 'eur',
                        product_data: {
                            name: 'Frais de service',
                            description: 'Frais de service et de traitement',
                        },
                        unit_amount: Math.round(restaurants.reduce((total, restaurant) => total + restaurant.amount, 0) * fees * 100), // Convert to cents
                    },
                    quantity: 1,
                },
            ],
        });
        // Update payment session with checkout session ID
        paymentSession.checkoutSessionId = session.id;
        await paymentSessionRef.set(paymentSession);
        return { sessionId: session.id };
    }
    catch (error) {
        console.error('Error creating checkout session:', error);
        throw new functions.https.HttpsError('internal', 'Unable to create checkout session');
    }
});
exports.createStripeConnectAccount = functions.https.onCall(async (data, context) => {
    /* if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    } */
    const { restaurantId } = data;
    if (!restaurantId) {
        throw new functions.https.HttpsError('invalid-argument', 'Restaurant ID is required');
    }
    try {
        // Get restaurant data from Firestore
        const restaurantDoc = await db.doc(`restaurants/${restaurantId}`).get();
        if (!restaurantDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'Restaurant not found');
        }
        const restaurantData = restaurantDoc.data();
        // Create a Stripe Connect account
        const account = await stripe.accounts.create({
            type: 'express',
            country: 'FR',
            email: restaurantData === null || restaurantData === void 0 ? void 0 : restaurantData.email,
            business_type: 'company',
            capabilities: {
                card_payments: { requested: true },
                transfers: { requested: true },
            },
        });
        // Update restaurant document with Stripe account ID
        await db.doc(`restaurants/${restaurantId}`).update({
            stripeAccountId: account.id,
            stripeAccountStatus: 'pending',
        });
        // Create an account link for onboarding
        const accountLink = await stripe.accountLinks.create({
            account: account.id,
            refresh_url: `${functions.config().app.url}/admin/settings/stripe-connect?refresh=true`,
            return_url: `${functions.config().app.url}/admin/settings/stripe-connect?success=true`,
            type: 'account_onboarding',
        });
        return { url: accountLink.url };
    }
    catch (error) {
        console.error('Error creating Stripe Connect account:', error);
        throw new functions.https.HttpsError('internal', 'Error creating Stripe Connect account');
    }
});
exports.handleStripeWebhook = functions.https.onRequest(async (req, res) => {
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
            const session = event.data.object;
            const { paymentSessionId } = session.metadata;
            // Ensure idempotency - check if payment was already processed
            const paymentSessionRef = db.collection('paymentSessions').doc(paymentSessionId);
            const paymentSessionSnap = await paymentSessionRef.get();
            const paymentSession = paymentSessionSnap.data();
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
            await Promise.all(paymentSession.restaurants.map(async (restaurant) => {
                try {
                    await stripe.transfers.create({
                        amount: Math.round(restaurant.amount * 100),
                        currency: 'eur',
                        destination: restaurant.stripeAccountId,
                        transfer_group: paymentSessionId,
                    });
                }
                catch (error) {
                    console.error(`Failed to transfer to restaurant ${restaurant.restaurantId}:`, error);
                    // Consider adding a retry mechanism or notification system here
                }
            }));
        }
        res.json({ received: true });
    }
    catch (error) {
        console.error('Webhook error:', error);
        // Don't expose internal error details in production
        res.status(400).send('Webhook Error');
    }
});
//# sourceMappingURL=stripe.js.map