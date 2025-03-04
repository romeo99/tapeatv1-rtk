import { forwardRef } from "react";
import { OrderItem } from "../types/firebase";

interface ReceiptProps {
    orderId: string;
    items: OrderItem[];
    total: number;
}

const Receipt = forwardRef<HTMLDivElement, ReceiptProps>(({ orderId, items, total }, ref) => (
    <div ref={ref} style={{ padding: 20, fontFamily: "monospace" }}>
        <h2>Reçu de commande</h2>
        <p>Commande # {orderId}</p>
        <hr />
        <ul>
            {items.map((item, index) => (
                <li key={index}>{item.name}</li>
            ))}
        </ul>
        <hr />
        <p><strong>Total:</strong> {total}€</p>
    </div>
));

export default Receipt;
