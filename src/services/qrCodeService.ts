import { 
  collection, 
  addDoc, 
  deleteDoc, 
  doc, 
  getDocs, 
  query,
  serverTimestamp,
  updateDoc
} from 'firebase/firestore';
import { db } from '../config/firebase';
import QRCode from 'qrcode';

export interface QRCodeData {
  id?: string;
  restaurantId?: string;
  foodCourtId?: string;
  label: string;
  tableNumber?: string;
  url: string;
  qrCodeImage: string;
  createdAt: Date;
}

export async function generateQRCode(
  entityId: string, 
  data: { 
    label: string; 
    tableNumber?: string;
    type: 'restaurant' | 'foodCourt';
  }
): Promise<string> {
  try {
    // Generate the URL for the QR code
    const baseUrl = window.location.origin;
    const url = data.type === 'restaurant' 
      ? `${baseUrl}/restaurant?restaurantId=${entityId}${data.tableNumber?.trim() ? `&table=${data.tableNumber.trim()}` : ''}`
      : `${baseUrl}/food-court?foodCourtId=${entityId}${data.tableNumber?.trim() ? `&table=${data.tableNumber.trim()}` : ''}`;

    // Generate QR code image
    const qrCodeImage = await QRCode.toDataURL(url, {
      width: 512,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff',
      }
    });

    // Save to Firestore
    const collectionPath = data.type === 'restaurant' 
      ? `restaurants/${entityId}/qrCodes`
      : `foodCourts/${entityId}/qrCodes`;

    const qrCodeRef = collection(db, collectionPath);
    const docRef = await addDoc(qrCodeRef, {
      [data.type === 'restaurant' ? 'restaurantId' : 'foodCourtId']: entityId,
      label: data.label.trim(),
      tableNumber: data.tableNumber?.trim() || null,
      url,
      qrCodeImage,
      createdAt: serverTimestamp()
    });

    // If it's a food court, update the food court document with the QR code
    if (data.type === 'foodCourt') {
      const foodCourtRef = doc(db, 'foodCourts', entityId);
      await updateDoc(foodCourtRef, {
        qrCode: qrCodeImage,
        updatedAt: serverTimestamp()
      });
    }

    return docRef.id;
  } catch (error) {
    console.error('Error generating QR code:', error);
    throw error;
  }
}

export async function getQRCodes(entityId: string, type: 'restaurant' | 'foodCourt'): Promise<QRCodeData[]> {
  try {
    const collectionPath = type === 'restaurant' 
      ? `restaurants/${entityId}/qrCodes`
      : `foodCourts/${entityId}/qrCodes`;

    const q = query(collection(db, collectionPath));
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate() || new Date()
    })) as QRCodeData[];
  } catch (error) {
    console.error('Error fetching QR codes:', error);
    throw error;
  }
}

export async function deleteQRCode(entityId: string, qrCodeId: string, type: 'restaurant' | 'foodCourt'): Promise<void> {
  try {
    if (!entityId || !qrCodeId) {
      throw new Error('Entity ID and QR code ID are required');
    }

    const collectionPath = type === 'restaurant' 
      ? `restaurants/${entityId}/qrCodes`
      : `foodCourts/${entityId}/qrCodes`;

    await deleteDoc(doc(db, collectionPath, qrCodeId));

    // If it's a food court, remove the QR code from the food court document
    if (type === 'foodCourt') {
      const foodCourtRef = doc(db, 'foodCourts', entityId);
      await updateDoc(foodCourtRef, {
        qrCode: null,
        updatedAt: serverTimestamp()
      });
    }
  } catch (error) {
    console.error('Error deleting QR code:', error);
    throw error;
  }
}

export async function downloadQRCode(qrCodeImage: string, fileName: string): Promise<void> {
  try {
    const link = document.createElement('a');
    link.download = `${fileName}.png`;
    link.href = qrCodeImage;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (error) {
    console.error('Error downloading QR code:', error);
    throw error;
  }
}