import { forwardRef } from "react";
import { Order } from "../types/firebase";

interface ReceiptProps {
    order: Order;
}

const Receipt = forwardRef<HTMLDivElement, ReceiptProps>(({ order }, ref) => (
    <div ref={ref} style={{
        padding: 10,
        fontFamily: "monospace",
        maxWidth: "80mm",
        width: "80mm",
        fontSize: "20px",
        overflow: "hidden",
        background: "white",
        wordWrap: "break-word"
    }}>
        <div style={{ fontSize: "25px", marginBottom: "10px" }}>
            <strong>Tapeat</strong>
        </div>
        <div
            style={{
                background: "black",
                color: "white",
                padding: "3px",
                textAlign: "left",
                fontSize: "30px",
                fontWeight: "bold",
                marginBottom: "8px",
                display: "flex",
            }}
        >
            <div style={{ flex: 1 }}>{order.orderNumber}</div>
            <div style={{ flex: 1 }}> {/* {customerName} */}</div>
        </div>

        <div style={{ fontSize: "11px", marginBottom: "8px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontFamily: "sans-serif", }}>
            Commande passée le {new Date(order.createdAt).toLocaleDateString()} à {new Date(order.createdAt).toLocaleTimeString()}
        </div>

        <hr style={{ margin: "5px 0" }} />

        <div style={{
            textAlign: "center",
            fontSize: "24px",
            margin: "10px 0"
        }}>
            {order.type === 'delivery' ? "LIVRAISON" : order.type === 'dine_in' ? "SUR PLACE" : "EMPORTER"}
        </div>

        <hr style={{ margin: "5px 0" }} />

        <div style={{ margin: "10px 0" }}>
            {order.items.map((item, index) => (
                <div key={index} style={{ marginBottom: "5px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
                        <div style={{ maxWidth: "70%", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.quantity} x {item.name}</div>
                        <div><strong>{item.price}€</strong></div>
                    </div>
                    {item.remarks && <p style={{ fontSize: "11px", paddingLeft: "10px" }}>{item.remarks}</p>}
                    {item.sections && item.sections.length > 0 &&
                        <div style={{ paddingLeft: "10px", fontSize: "11px" }}>
                            <strong>COMPOSITION DU MENU</strong><br />
                            {item.sections.map((ing, idx) => (
                                <span style={{ paddingLeft: "10px", fontSize: "10px" }} key={idx}>{ing.name}: {ing.choice} <br /></span>
                            ))}
                        </div>
                    }
                    {item.excludedIngredients && item.excludedIngredients.length > 0 &&
                        <div style={{ paddingLeft: "10px", fontSize: "11px" }}>
                            <strong>INGREDIENTS EXCLUS</strong><br />
                            {item.excludedIngredients.map((ing, idx) => (
                                <span key={idx}>{ing}{idx < item.excludedIngredients!.length - 1 ? ',' : ''} </span>
                            ))}
                        </div>
                    }
                </div>
            ))}
        </div>

        <hr style={{ borderStyle: "dashed", margin: "5px 0" }} />

        <div style={{ margin: "10px 0" }}>
            <div style={{ fontWeight: "bold", marginBottom: "3px", fontSize: "12px" }}>Remarques du client :</div>
            <div style={{
                border: "1px solid #ccc",
                padding: "5px",
                fontSize: "10px",
                wordWrap: "break-word"
            }}>
                {order.restaurantId}
            </div>
        </div>

        <hr style={{ borderStyle: "dashed", margin: "5px 0" }} />

        <div style={{ margin: "10px 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px", fontSize: "15px" }}>
                <div>Sous-total</div>
                <div>{order.subtotal}€</div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold", fontSize: "15px" }}>
                <div>Montant payé</div>
                <div>{order.total}€</div>
            </div>
        </div>

        <hr style={{ margin: "5px 0" }} />

        <div style={{ fontSize: "10px", textAlign: "center", margin: "8px 0" }}>
            Merci pour votre commande à mon enseigne
        </div>
    </div>
));

export default Receipt;
