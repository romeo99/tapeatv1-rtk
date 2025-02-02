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
exports.handleStripeWebhook = exports.createCheckoutSession = void 0;
/* eslint-disable @typescript-eslint/no-explicit-any */
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const stripe_1 = __importDefault(require("stripe"));
const stripe = new stripe_1.default(functions.config().stripe.secret_key, {
    apiVersion: '2025-01-27.acacia',
});
const db = admin.firestore();
exports.createCheckoutSession = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    const { restaurants, successUrl, cancelUrl } = data;
    const userId = context.auth.uid;
    try {
        // Create payment session in Firestore
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
            payment_method_types: ['card'],
            mode: 'payment',
            success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: cancelUrl,
            customer_email: context.auth.token.email,
            metadata: {
                paymentSessionId: paymentSessionRef.id,
                userId,
            },
            line_items: restaurants.flatMap((restaurant) => restaurant.items.map((item) => ({
                price_data: {
                    currency: 'usd',
                    product_data: {
                        name: item.name,
                        images: [item.image],
                    },
                    unit_amount: Math.round(item.price * 100), // Convert to cents
                },
                quantity: item.quantity,
            }))),
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
exports.handleStripeWebhook = functions.https.onRequest(async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const endpointSecret = functions.config().stripe.webhook_secret;
    try {
        const event = stripe.webhooks.constructEvent(req.rawBody, sig, endpointSecret);
        if (event.type === 'checkout.session.completed') {
            const session = event.data.object;
            const { paymentSessionId } = session.metadata;
            // Update payment session status
            const paymentSessionRef = db.collection('paymentSessions').doc(paymentSessionId);
            const paymentSession = (await paymentSessionRef.get()).data();
            // Create orders for each restaurant
            const orderPromises = paymentSession.restaurants.map(async (restaurant) => {
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
                return orderRef.set(order);
            });
            await Promise.all([
                paymentSessionRef.update({
                    status: 'completed',
                    updatedAt: admin.firestore.Timestamp.now(),
                }),
                ...orderPromises,
            ]);
        }
        res.json({ received: true });
    }
    catch (error) {
        console.error('Webhook error:', error);
        res.status(400).send(`Webhook Error: ${error.message}`);
    }
});
//# sourceMappingURL=stripe.js.map