import * as functions from 'firebase-functions';
import * as nodemailer from 'nodemailer';

// Configuration de l'email
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: 'amelesusu@gmail.com',
        pass: 'msai kfwk pvph oilp',
    },
});

export const sendOrderConfirmation = functions.https.onCall(async (data, context) => {
    /* if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Utilisateur non authentifié');
    } */

    const { to, subject, order } = data;

    if (!to || !subject || !order) {
        throw new functions.https.HttpsError('invalid-argument', 'Champs requis manquants');
    }

    const formatItems = (items: any[]) => {
        return items.map(item => `
      <div style="margin-bottom:5px;">
        <div style="display:flex;justify-content:space-between;font-size:15px;">
          <div style="max-width:70%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex: 1;">
            ${item.quantity} x ${item.name}
          </div>
          <div style="flex: 1; text-align: right;"><strong>${item.price}€</strong></div>
        </div>
        ${item.remarks ? `<p style="font-size:13px;padding-left:10px;">${item.remarks}</p>` : ""}
        ${item.sections && item.sections.length > 0 ? `
          <div style="padding-left:10px;font-size:13px;">
            <strong>COMPOSITION DU MENU</strong><br />
            ${item.sections.map((ing: any) =>
            `<span style="padding-left:10px;font-size:12px;">${ing.name}: ${ing.choice}<br /></span>`
        ).join("")}
          </div>` : ""}
        ${item.excludedIngredients && item.excludedIngredients.length > 0 ? `
          <div style="padding-left:10px;font-size:13px;">
            <strong>INGRÉDIENTS EXCLUS</strong><br />
            ${item.excludedIngredients.map((ing: string, idx: number) =>
            `${ing}${idx < item.excludedIngredients.length - 1 ? ',' : ''} `
        ).join("")}
          </div>` : ""}
      </div>
    `).join("");
    };

    const html = `
    <div style="padding:10px;font-family:monospace;max-width:80mm;font-size:22px;background:white;">
      <div style="font-size:27px;margin-bottom:10px;"><strong>Tapeat</strong></div>
      <div style="background:black;color:white;padding:3px;text-align:left;font-size:35px;font-weight:bold;margin-bottom:8px;display:flex;">
        <div style="flex:1;">${order.orderNumber}</div>
        <div style="flex:1;"></div>
      </div>

      <div style="font-size:13px;margin-bottom:8px;font-family:sans-serif;">
        Commande passée le ${new Date().toLocaleDateString('fr')} à ${new Date().toLocaleTimeString('fr')}
      </div>

      <hr style="margin:5px 0;" />

      <div style="text-align:center;font-size:24px;font-weight:bold;margin:10px 0;">
        ${order.type === 'delivery' ? "LIVRAISON" : order.type === 'dine_in' ? "SUR PLACE" : "EMPORTER"}
      </div>

      <hr style="margin:5px 0;" />

      <div style="margin:10px 0;">
        ${formatItems(order.items)}
      </div>

      ${order.message ? `
        <hr style="border-style:dashed;margin:5px 0;" />
        <div style="margin:10px 0;">
          <div style="font-weight:bold;margin-bottom:3px;font-size:14px;">Remarques du client :</div>
          <div style="border:1px solid #ccc;padding:5px;font-size:12px;">
            ${order.message}
          </div>
        </div>` : ""}

      <hr style="border-style:dashed;margin:5px 0;" />

      <div style="margin:10px 0;">
        <div style="display:flex;justify-content:space-between;margin-bottom:3px;font-size:17px;">
            <div style="flex: 1;">Sous-total</div>
            <div style="flex: 1; text-align: right;">${parseFloat(order.subtotal).toFixed(2)}&nbsp;€</div>
        </div>
        <div style="display:flex;justify-content:space-between;font-weight:bold;font-size:17px;">
          <div style="flex: 1;">Montant payé</div>
          <div style="flex: 1; text-align: right;">${parseFloat(order.total).toFixed(2)}&nbsp;€</div>
        </div>
      </div>

      <hr style="margin:5px 0;" />

      <div style="font-size:12px;text-align:center;margin:8px 0;">
        Merci pour votre commande à notre enseigne
      </div>
    </div>
  `;

    const mailOptions = {
        from: 'amelesusu@gmail.com',
        to,
        subject,
        html,
    };

    try {
        await transporter.sendMail(mailOptions);
        return { success: true };
    } catch (error) {
        console.error('Erreur d’envoi email:', error);
        throw new functions.https.HttpsError('internal', 'Erreur lors de l’envoi de l’e-mail');
    }
});