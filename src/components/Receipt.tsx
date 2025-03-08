import { forwardRef } from "react";
import { Order } from "../types/firebase";

interface ReceiptProps {
    order: Order;
}

const Receipt = forwardRef<HTMLDivElement, ReceiptProps>(({ order }, ref) => (
    <div ref={ref} style={{ padding: 20, fontFamily: "monospace" }}>
        <div
            style={{
                padding: 10,
                fontFamily: "monospace",
                border: "2px solid black",
                width: "80mm",
                background: "white",
                fontSize: "12px",
                wordWrap: "break-word",
                overflow: "hidden",
            }}
        >
            <h2 style={{ fontSize: "25px", fontWeight: "bold", }}>Tapeat</h2>
            <div
                style={{
                    background: "black",
                    color: "white",
                    padding: "5px",
                    textAlign: "center",
                    fontSize: "14px",
                    fontWeight: "bold",
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                    textOverflow: "ellipsis",
                }}
            >
                {order.orderNumber} {/* {customerName} */}
            </div>
            <p style={{ fontSize: "10px" }}>
                Commande passée le {new Date(order.createdAt).toLocaleDateString()} à {new Date(order.createdAt).toLocaleTimeString()}
                {order.scheduledTime && (
                    <>
                        <br /> À préparer pour {new Date(order.scheduledTime).toLocaleDateString()} à {new Date(order.scheduledTime).toLocaleTimeString()}
                    </>
                )}
            </p>
            <hr />
            <h3 style={{ textAlign: "center", fontSize: "12px" }}>{order.type === 'delivery' ? "LIVRAISON" : order.type === 'dine_in' ? "SUR PLACE" : "EMPORTER"}</h3>
            <hr />
            <ul style={{ paddingLeft: "10px", fontSize: "10px" }}>
                {order.items.map((item, index) => (
                    <li key={index}>
                        {item.quantity} x {item.name} - {item.price}€
                        {item.remarks && <p style={{ fontSize: "10px" }}>{item.remarks}</p>}
                        {/* {item.options && (
                            <ul>
                                {item.options.map((opt, idx) => (
                                    <li key={idx} style={{ fontSize: "10px" }}>
                                        {opt}
                                    </li>
                                ))}
                            </ul>
                        )} */}
                    </li>
                ))}
            </ul>
            <hr />
            <p style={{ fontSize: "10px" }}>
                <strong>Remarque du client :</strong>
                <br /> {order.tax}
            </p>
            <hr />
            <p style={{ fontSize: "10px" }}>
                <strong>Sous-total:</strong> {order.subtotal}€
                <br />
                <strong>Montant payé:</strong> {order.total}€
            </p>
            <hr />
            <p style={{ textAlign: "center", fontSize: "10px" }}>Merci pour votre commande à mon enseigne</p>
        </div>
    </div>
));

export default Receipt;
