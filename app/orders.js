import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Image,
  LayoutAnimation,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  useWindowDimensions,
  View
} from 'react-native';

import {
  Lexend_400Regular,
  Lexend_700Bold,
  useFonts
} from '@expo-google-fonts/lexend';
import { Ionicons } from '@expo/vector-icons';

// IMPORT EXPO PRINT FOR MOBILE PRINTING

// FIREBASE IMPORTS
import { collection, doc, getDocs, onSnapshot, orderBy, query, updateDoc, where } from 'firebase/firestore';
import { Colors } from '../constants/theme';
import { useAppTheme } from '../constants/ThemeContext';
import { db } from '../firebaseConfig';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const getStatusStyle = (status) => {
  switch (status) {
    case 'Returned': return { bg: '#FFF3E0', icon: 'return-up-back-outline', color: '#D97B39' };
    case 'Refunded': return { bg: '#FFE5E5', icon: 'cash-outline', color: '#C0392B' };
    case 'Ongoing':  return { bg: '#FFFDE7', icon: 'time-outline', color: '#F59E0B' };
    default: return { bg: '#E4F4EC', icon: 'checkmark-done', color: '#0A5A3A' };
  }
};

export default function OrdersScreen() {
  const router = useRouter();

  const { appTheme } = useAppTheme();
  const currentColors = Colors[appTheme] || Colors.light;

  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const minDim = Math.min(width, height);
  const isMobile = minDim < 768;
  const isTablet = minDim >= 768 && minDim < 1024;

  let scaleRatio = Math.min(width / 1180, height / 800, 1);

  if (isMobile) {
    scaleRatio = isLandscape ? Math.min(height / 650, 0.65) : Math.max(scaleRatio, 0.75);
  } else if (isTablet) {
    scaleRatio = isLandscape ? Math.min(height / 800, 0.8) : Math.max(scaleRatio, 0.9);
  }

  if (isMobile && !isLandscape) {
    scaleRatio = Math.min(scaleRatio, 0.55);
  }

  if (height < 500) {
    scaleRatio = Math.min(scaleRatio, 0.5);
  } else if (height < 600) {
    scaleRatio = Math.min(scaleRatio, 0.65);
  }

  const s = (size) => Math.max(Math.round(size * scaleRatio), 1);
  const styles = useMemo(() => getStyles(s, width, currentColors), [width, height, isMobile, isLandscape, appTheme]);
 
  const [currentTime, setCurrentTime] = useState(new Date());

  const [isCompletedOpen, setIsCompletedOpen] = useState(false);
  const slideAnim = useRef(new Animated.Value(0)).current;

  const [pendingOrders, setPendingOrders] = useState([]);
  const [completedOrders, setCompletedOrders] = useState([]);

  const [receiptVisible, setReceiptVisible] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);

  const [statusChangeModalVisible, setStatusChangeModalVisible] = useState(false);
  const [statusChangeTarget, setStatusChangeTarget] = useState(null);



  let [fontsLoaded] = useFonts({
    Lexend_400Regular,
    Lexend_700Bold,
  });

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    // Only listen to today's transactions instead of the entire history
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const q = query(
      collection(db, 'salestransaction'),
      where('createdAt', '>=', startOfToday),
      orderBy('createdAt', 'desc')
    );

    // Orders left 'Ongoing' from earlier days are closed once, outside the live listener
    getDocs(query(collection(db, 'salestransaction'), where('status', '==', 'Ongoing')))
      .then((snap) => {
        snap.forEach((d) => {
          const created = d.data().createdAt;
          const date = created?.toDate ? created.toDate() : null;
          if (date && date < startOfToday) {
            updateDoc(doc(db, 'salestransaction', d.id), { status: 'Completed' }).catch(() => {});
          }
        });
      })
      .catch(() => {});
   
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const pending = [];
      const completed = [];
      const staleOngoingIds = [];
     
      const todayString = new Date().toDateString();

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const status = data.status || 'Ongoing';
       
        let orderDate = new Date();
        if (data.createdAt) {
          if (typeof data.createdAt.toDate === 'function') {
            orderDate = data.createdAt.toDate();
          } else if (data.createdAt.seconds) {
            orderDate = new Date(data.createdAt.seconds * 1000);
          } else {
            orderDate = new Date(data.createdAt);
          }
        }

        // Auto-resolve any Ongoing orders that belong to a previous day -
        // they were never completed before the day rolled over, so we close
        // them silently so they no longer inflate the badge count.
        if (status === 'Ongoing' && orderDate.toDateString() !== todayString) {
          staleOngoingIds.push(docSnap.id);
          return; // exclude from today's lists entirely
        }
       
        // STRICTLY FILTER BY TODAY SO IT DISAPPEARS ONCE THE DAY ENDS
        if (orderDate.toDateString() === todayString) {
            
          let timeStr = orderDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
          let dateStr = orderDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
         
          const itemsList = data.orders ? data.orders.map(o => {
            const addonStr = o.addons && o.addons.trim() !== '' ? ` (${o.addons})` : '';
            const sugarStr = o.sugarLevel !== null && o.sugarLevel !== undefined ? ` [Sugar: ${o.sugarLevel}%]` : '';
            return `${o.qty}x ${o.size} ${o.name}${addonStr}${sugarStr}`;
          }) : [];
         
          const orderObj = {
            docId: docSnap.id,
            id: data.transactionNumber || docSnap.id,
            time: timeStr,
            dateStr: dateStr,
            createdAt: orderDate,
            name: data.customerName || 'Walk-in',
            items: itemsList,
            rawItems: data.orders || [],
            total: `₱${(data.totalAmount || 0).toFixed(2)}`,
            status: status,
            customerType: data.customerType || 'Regular',
            orderMode: data.orderMode || 'Take Out',
            paymentMode: data.modeOfPayment || 'Cash',
            subTotal: data.subTotal || 0,
            discountAmount: data.discountAmount || 0,
            promoDiscountAmount: data.promoDiscountAmount || 0,
            appliedPromotions: data.appliedPromotions || [],
            totalAmount: data.totalAmount || 0,
            cashierName: data.cashierName || 'Unknown Cashier',
            cashTendered: data.cashTendered ?? null,
            changeGiven: data.changeGiven ?? null,
          };
         
          if (status === 'Ongoing') {
            pending.push(orderObj);
          } else {
            completed.push(orderObj);
          }
        }
      });

      // Silently mark stale Ongoing orders as Completed in Firestore so the
      // badge on the home screen (and any other listener) stops counting them.
      if (staleOngoingIds.length > 0) {
        staleOngoingIds.forEach(id => {
          updateDoc(doc(db, 'salestransaction', id), { status: 'Completed' }).catch(() => {});
        });
      }
     
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setPendingOrders(pending);
      setCompletedOrders(completed);
    });
   
    return () => unsubscribe();
  }, []);

  if (!fontsLoaded) return null;

  const formattedDate = currentTime.toLocaleDateString('en-US', {
    weekday: 'long', month: 'short', day: 'numeric', year: 'numeric'
  });
 
  const formattedTime = currentTime.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', second: '2-digit'
  });

  const markOrderCompleted = async (docId) => {
    try {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      const orderRef = doc(db, 'salestransaction', docId);
      await updateDoc(orderRef, { status: 'Completed' });
    } catch (error) {
      console.error("Error completing order:", error);
    }
  };

  const toggleCompletedDrawer = () => {
    Animated.timing(slideAnim, {
      toValue: isCompletedOpen ? 0 : 1,
      duration: 350,
      useNativeDriver: true,
    }).start();
    setIsCompletedOpen(!isCompletedOpen);
  };

  const openReceiptModal = (order) => {
    setSelectedOrder(order);
    setReceiptVisible(true);
  };

  const openStatusChangeModal = (order) => {
    const ageMs = Date.now() - order.createdAt.getTime();
    if (ageMs > 24 * 60 * 60 * 1000) {
      Alert.alert('Time Limit Reached', 'Order status can only be changed within 24 hours of the transaction.');
      return;
    }
    setStatusChangeTarget(order);
    setStatusChangeModalVisible(true);
  };

  const changeOrderStatus = async (newStatus) => {
    if (!statusChangeTarget) return;
    try {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      const orderRef = doc(db, 'salestransaction', statusChangeTarget.docId);
      await updateDoc(orderRef, { status: newStatus });
      setStatusChangeModalVisible(false);
      setStatusChangeTarget(null);
    } catch (error) {
      console.error('Error changing order status:', error);
    }
  };

  const printReceipt = async (order) => {
    const itemsHtml = order.rawItems.map(item => `
      <div class="item-block">
        <div class="row">
          <span class="item-name">${item.qty}x ${item.size} ${item.name}</span>
          <span class="price">&#8369;${((item.effectivePrice ?? item.totalPrice) || 0).toFixed(2)}</span>
        </div>
        ${item.addons && item.addons.trim() !== '' ? `<div class="item-addon">+ ${item.addons}</div>` : ''}
        ${item.sugarLevel !== null && item.sugarLevel !== undefined ? `<div class="item-addon">Sugar: ${item.sugarLevel}%</div>` : ''}
      </div>
    `).join('');

    const discountHtml = [
      order.discountAmount > 0
        ? `<div class="row total-line"><span>Discount (${order.customerType}):</span><span>-&#8369;${order.discountAmount.toFixed(2)}</span></div>`
        : '',
      order.promoDiscountAmount > 0
        ? `<div class="row total-line"><span>Promo Savings:</span><span>-&#8369;${order.promoDiscountAmount.toFixed(2)}</span></div>`
        : '',
    ].join('');

    const receiptHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Receipt ${order.id}</title>
  <style>
    @page { size: 58mm auto; margin: 3mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: 52mm;
      font-family: 'Courier New', Courier, monospace;
      font-size: 8pt;
      color: #000;
      line-height: 1.4;
    }
    .center { text-align: center; }
    .divider { border: none; border-top: 1px dashed #000; margin: 2mm 0; }
    .row { display: flex; justify-content: space-between; align-items: flex-start; gap: 2mm; }
    .row .item-name { flex: 1; font-weight: bold; font-size: 8pt; }
    .row .price { white-space: nowrap; }
    .shop-name { font-size: 13pt; font-weight: bold; text-align: center; margin-bottom: 1mm; }
    .shop-sub { font-size: 7pt; text-align: center; margin-bottom: 1mm; }
    .tx-num { font-size: 9.5pt; font-weight: bold; text-align: center; margin: 2mm 0; letter-spacing: 0.5pt; }
    .meta { font-size: 7.5pt; margin-bottom: 0.5mm; }
    .section-title { font-weight: bold; font-size: 8.5pt; margin-bottom: 1.5mm; }
    .item-block { margin-bottom: 1.5mm; }
    .item-addon { font-size: 7pt; padding-left: 2mm; color: #444; }
    .total-line { font-size: 8pt; margin-bottom: 0.5mm; }
    .grand-total-line { font-size: 10pt; font-weight: bold; margin-top: 1.5mm; }
    .footer-text { font-size: 7pt; text-align: center; margin-top: 0.8mm; }
  </style>
</head>
<body>
  <div class="shop-name">VANILLA BREW</div>
  <div class="shop-sub">Coffee &amp; More</div>
  <hr class="divider">
  <div class="tx-num">${order.id}</div>
  <div class="meta">${order.dateStr}</div>
  <div class="meta">Time: ${order.time}</div>
  <div class="meta">Cashier: ${order.cashierName}</div>
  <div class="meta">Customer: ${order.name}</div>
  <div class="meta">Type: ${order.customerType}</div>
  <div class="meta">Mode: ${order.orderMode}</div>
  <div class="meta">Payment: ${order.paymentMode}</div>
  <div class="meta">Status: ${order.status}</div>
  <hr class="divider">
  <div class="section-title">ORDER ITEMS</div>
  ${itemsHtml}
  <hr class="divider">
  ${(order.discountAmount > 0 || order.promoDiscountAmount > 0) ? `<div class="row total-line"><span>Subtotal:</span><span>&#8369;${order.rawItems.reduce((s, i) => s + ((i.effectivePrice ?? i.totalPrice) || 0), 0).toFixed(2)}</span></div>` : ''}
  ${discountHtml}
  <div class="row grand-total-line"><span>TOTAL:</span><span>&#8369;${order.totalAmount.toFixed(2)}</span></div>
  <hr class="divider">
  <div class="footer-text">Thank you for your purchase!</div>
  <div class="footer-text">Please come again.</div>
</body>
</html>`;

    const printWindow = window.open('', '_blank', 'width=350,height=700');
    if (printWindow) {
      printWindow.document.write(receiptHtml);
      printWindow.document.close();
      printWindow.onload = () => {
        printWindow.focus();
        printWindow.print();
        printWindow.close();
      };
    }
  };

  const translateX = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [s(550), 0]
  });

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.headerBrand}>
          <Image
            source={require('../assets/images/company-logo.png')}
            style={[styles.logoCompany, { tintColor: '#FFFFFF' }]}
            resizeMode="contain"
          />
          <Image
            source={require('../assets/images/sms-logo.png')}
            style={[styles.logoSms, { tintColor: '#FFFFFF' }]}
            resizeMode="contain"
          />
        </View>

        <View style={styles.headerRight}>
          <View style={styles.dateTimeContainer}>
            <Text style={styles.dateTextTop}>{formattedDate}</Text>
            <Text style={styles.timeTextBottom}>{formattedTime}</Text>
          </View>
        </View>
      </View>

      {/* BODY WRAPPER */}
      <View style={styles.bodyWrapper}>
       
        {/* --- PENDING ORDERS --- */}
        <View style={styles.mainContent}>
          <View style={styles.mainWhiteBox}>
            <View style={styles.boxHeader}>
              <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                <Ionicons name="chevron-back" size={s(24)} color={currentColors.textMain} />
              </TouchableOpacity>
              <Text style={styles.boxTitle}>Ongoing Orders</Text>
              <View style={styles.badgePending}>
                <Text style={styles.badgePendingText}>{pendingOrders.length}</Text>
              </View>
            </View>

            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              {pendingOrders.map((order, index) => (
                <View key={order.docId} style={styles.orderCard}>
                  <TouchableOpacity
                    style={styles.orderCardTouch}
                    activeOpacity={0.6}
                    onPress={() => openReceiptModal(order)}
                  >
                    <View style={styles.orderLeft}>
                      <View style={styles.orderHeaderRow}>
                        <Text style={styles.orderId}>{order.id}</Text>
                        <View style={styles.timePill}>
                          <Text style={styles.timeText}>{order.time}</Text>
                        </View>
                        <Text style={styles.customerName} numberOfLines={1} ellipsizeMode="tail">
                          {order.name}
                        </Text>
                      </View>
                      <View style={styles.itemList}>
                        {order.items.map((item, idx) => (
                          <View key={idx} style={styles.itemRow}>
                            <View style={styles.itemDot} />
                            <Text style={styles.itemText}>{item}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                    <View style={styles.orderPriceCol}>
                      <Text style={styles.priceText} adjustsFontSizeToFit numberOfLines={1}>{order.total}</Text>
                    </View>
                  </TouchableOpacity>
                 
                  <View style={styles.orderActionCol}>
                    <TouchableOpacity
                      style={styles.completeBtn}
                      activeOpacity={0.8}
                      onPress={() => markOrderCompleted(order.docId)}
                    >
                      <Ionicons name="checkmark-outline" size={s(20)} color="#FFFFFF" />
                      <Text style={styles.completeBtnText}>Complete Order</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>

        {/* --- COMPLETED ORDERS SLIDING DRAWER --- */}
        <Animated.View style={[styles.drawerContainer, { transform: [{ translateX }] }]}>
         
          <TouchableOpacity
            style={styles.sideTab}
            onPress={toggleCompletedDrawer}
            activeOpacity={0.9}
          >
            <Ionicons
              name={isCompletedOpen ? "chevron-forward" : "checkmark-circle-outline"}
              size={s(28)}
              color="#0A5A3A"
            />
            <View style={styles.rotatedTextContainer}>
              <Text style={styles.rotatedText}>COMPLETED</Text>
            </View>
          </TouchableOpacity>

          <View style={styles.drawerWhiteBox}>
            <View style={styles.boxHeader}>
              <Text style={styles.boxTitle}>Completed Orders</Text>
              <View style={styles.badgeCompleted}>
                <Text style={styles.badgeCompletedText}>{completedOrders.length}</Text>
              </View>
            </View>

            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              {completedOrders.map((order, index) => {
                const statusStyle = getStatusStyle(order.status);
                return (
                  <View key={order.docId} style={styles.orderCard}>
                    <TouchableOpacity
                      style={styles.orderCardTouch}
                      activeOpacity={0.6}
                      onPress={() => openReceiptModal(order)}
                    >
                      <View style={styles.orderLeft}>
                        <View style={styles.orderHeaderRow}>
                          <Text style={styles.orderId}>{order.id}</Text>
                          <View style={styles.timePill}>
                            <Text style={styles.timeText}>{order.time}</Text>
                          </View>
                          <Text style={styles.customerName} numberOfLines={1} ellipsizeMode="tail">
                            {order.name}
                          </Text>
                        </View>
                        <View style={styles.itemList}>
                          {order.items.map((item, idx) => (
                            <View key={idx} style={styles.itemRow}>
                              <View style={styles.itemDot} />
                              <Text style={styles.itemText}>{item}</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                      <View style={styles.orderPriceCol}>
                        <Text style={styles.priceText} adjustsFontSizeToFit numberOfLines={1}>{order.total}</Text>
                        <View style={[styles.completedTag, { backgroundColor: statusStyle.bg }]}>
                          <Ionicons name={statusStyle.icon} size={s(18)} color={statusStyle.color} />
                          <Text style={[styles.completedTagText, { color: statusStyle.color }]}>{order.status}</Text>
                        </View>
                      </View>
                    </TouchableOpacity>

                    <View style={styles.orderActionCol}>
                      <TouchableOpacity
                        style={styles.changeStatusBtn}
                        activeOpacity={0.8}
                        onPress={() => openStatusChangeModal(order)}
                      >
                        <Ionicons name="swap-horizontal-outline" size={s(18)} color="#FFFFFF" />
                        <Text style={styles.changeStatusBtnText}>Status</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </Animated.View>
      </View>

      {/* --- RECEIPT MODAL --- */}
      <Modal animationType="fade" transparent visible={receiptVisible}>
        <View style={styles.modalOverlay}>
          {selectedOrder && (
            <View style={styles.receiptContainer}>
              <View style={styles.receiptHeader}>
                <Text style={styles.receiptTitle}>Transaction Details</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(15) }}>
                  <TouchableOpacity
                    style={styles.printBtn}
                    onPress={() => printReceipt(selectedOrder)}
                  >
                    <Ionicons name="print-outline" size={s(22)} color="#FFFFFF" />
                    <Text style={styles.printBtnText}>Print</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setReceiptVisible(false)}>
                    <Ionicons name="close" size={s(32)} color={currentColors.textMain} />
                  </TouchableOpacity>
                </View>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} style={styles.receiptBody}>
               
                <View style={styles.receiptMetaRow}>
                  <Text style={styles.receiptLabel}>Transaction No:</Text>
                  <Text style={styles.receiptValue}>{selectedOrder.id}</Text>
                </View>
                <View style={styles.receiptMetaRow}>
                  <Text style={styles.receiptLabel}>Date & Time:</Text>
                  <Text style={styles.receiptValue}>{selectedOrder.dateStr} at {selectedOrder.time}</Text>
                </View>
                <View style={styles.receiptMetaRow}>
                  <Text style={styles.receiptLabel}>Cashier:</Text>
                  <Text style={styles.receiptValue}>{selectedOrder.cashierName}</Text>
                </View>

                <View style={styles.divider} />

                <View style={styles.receiptMetaRow}>
                  <Text style={styles.receiptLabel}>Customer Name:</Text>
                  <Text style={styles.receiptValue}>{selectedOrder.name}</Text>
                </View>
                <View style={styles.receiptMetaRow}>
                  <Text style={styles.receiptLabel}>Customer Type:</Text>
                  <Text style={styles.receiptValue}>{selectedOrder.customerType}</Text>
                </View>
                <View style={styles.receiptMetaRow}>
                  <Text style={styles.receiptLabel}>Order Mode:</Text>
                  <Text style={styles.receiptValue}>{selectedOrder.orderMode}</Text>
                </View>
                <View style={styles.receiptMetaRow}>
                  <Text style={styles.receiptLabel}>Payment Method:</Text>
                  <Text style={styles.receiptValue}>{selectedOrder.paymentMode}</Text>
                </View>
                <View style={styles.receiptMetaRow}>
                  <Text style={styles.receiptLabel}>Status:</Text>
                  <Text style={[styles.receiptValue, { color: getStatusStyle(selectedOrder.status).color }]}>
                    {selectedOrder.status}
                  </Text>
                </View>

                <View style={styles.divider} />

                <Text style={styles.receiptSectionTitle}>Order Items</Text>
                {selectedOrder.rawItems.map((item, idx) => (
                  <View key={idx} style={styles.receiptItemRow}>
                    <View style={styles.receiptItemLeft}>
                      <Text style={styles.receiptItemName}>{item.qty}x {item.size} {item.name}</Text>
                      {item.addons && item.addons.trim() !== '' && (
                        <Text style={styles.receiptItemAddons}>Add-ons: {item.addons}</Text>
                      )}
                      {item.sugarLevel !== null && item.sugarLevel !== undefined && (
                        <Text style={styles.receiptItemAddons}>Sugar: {item.sugarLevel}%</Text>
                      )}
                    </View>
                    <Text style={styles.receiptItemPrice}>₱{((item.effectivePrice ?? item.totalPrice) || 0).toFixed(2)}</Text>
                  </View>
                ))}

                <View style={styles.divider} />

                {(() => {
                  const displaySubTotal = selectedOrder.rawItems.reduce(
                    (sum, item) => sum + ((item.effectivePrice ?? item.totalPrice) || 0), 0
                  );
                  return (
                    <>
                      <View style={styles.receiptTotalRow}>
                        <Text style={styles.receiptTotalLabel}>Subtotal</Text>
                        <Text style={styles.receiptTotalValue}>₱{displaySubTotal.toFixed(2)}</Text>
                      </View>
                      <View style={styles.receiptTotalRow}>
                        <Text style={styles.receiptTotalLabel}>Discount</Text>
                        <Text style={[styles.receiptTotalValue, { color: '#DF0C0C' }]}>
                          - ₱{selectedOrder.discountAmount.toFixed(2)}
                        </Text>
                      </View>
                      {selectedOrder.promoDiscountAmount > 0 && (
                        <View style={styles.receiptTotalRow}>
                          <Text style={styles.receiptTotalLabel}>Promo Savings</Text>
                          <Text style={[styles.receiptTotalValue, { color: '#06BC2E' }]}>
                            - ₱{selectedOrder.promoDiscountAmount.toFixed(2)}
                          </Text>
                        </View>
                      )}
                      <View style={[styles.receiptTotalRow, { marginTop: s(10) }]}>
                        <Text style={styles.receiptGrandTotalLabel}>Grand Total</Text>
                        <Text style={styles.receiptGrandTotalValue}>₱{selectedOrder.totalAmount.toFixed(2)}</Text>
                      </View>
                      {selectedOrder.cashTendered != null && (
                        <>
                          <View style={styles.receiptTotalRow}>
                            <Text style={styles.receiptTotalLabel}>Cash Tendered</Text>
                            <Text style={styles.receiptTotalValue}>₱{selectedOrder.cashTendered.toFixed(2)}</Text>
                          </View>
                          <View style={styles.receiptTotalRow}>
                            <Text style={styles.receiptTotalLabel}>Change</Text>
                            <Text style={styles.receiptTotalValue}>₱{Math.max(0, selectedOrder.changeGiven).toFixed(2)}</Text>
                          </View>
                        </>
                      )}
                    </>
                  );
                })()}
               
              </ScrollView>
            </View>
          )}
        </View>
      </Modal>

      {/* --- STATUS CHANGE MODAL --- */}
      <Modal animationType="fade" transparent visible={statusChangeModalVisible}>
        <View style={styles.modalOverlay}>
          <View style={styles.statusChangeModalContainer}>
            <Text style={styles.statusChangeTitle}>Change Order Status</Text>
            {statusChangeTarget && (
              <Text style={styles.statusChangeSubtitle}>
                {statusChangeTarget.id} — {statusChangeTarget.name}
              </Text>
            )}

            <View style={styles.statusOptionsRow}>
              {['Completed', 'Returned'].map((status) => {
                const st = getStatusStyle(status);
                const isCurrent = statusChangeTarget?.status === status;
                return (
                  <TouchableOpacity
                    key={status}
                    style={[
                      styles.statusOption,
                      { backgroundColor: st.bg, borderColor: isCurrent ? st.color : currentColors.border },
                      isCurrent && { borderWidth: s(2.5) }
                    ]}
                    onPress={() => !isCurrent && changeOrderStatus(status)}
                    activeOpacity={isCurrent ? 1 : 0.7}
                  >
                    <Ionicons name={st.icon} size={s(28)} color={st.color} />
                    <Text style={[styles.statusOptionText, { color: st.color }]}>{status}</Text>
                    {isCurrent && (
                      <Text style={[styles.currentStatusLabel, { color: st.color }]}>Current</Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={styles.statusCancelBtn}
              onPress={() => { setStatusChangeModalVisible(false); setStatusChangeTarget(null); }}
            >
              <Text style={styles.statusCancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const getStyles = (s, width, colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.containerBg },
  bold: { fontFamily: 'Lexend_700Bold' },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: s(50),
    paddingVertical: s(25),
    backgroundColor: colors.headerBg,
    borderBottomLeftRadius: s(30),
    borderBottomRightRadius: s(30),
    elevation: s(10),
    zIndex: 10
  },
  headerBrand: { flexDirection: 'row', alignItems: 'center', gap: s(30) },
  logoCompany: { width: s(180), height: s(80) },
  logoSms: { width: s(160), height: s(75) },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: s(40) },
  dateTimeContainer: { alignItems: 'flex-end', justifyContent: 'center' },
  dateTextTop: { color: '#E0D6D1', fontSize: s(20), fontFamily: 'Lexend_700Bold' },
  timeTextBottom: { color: '#FFFFFF', fontSize: s(36), fontFamily: 'Lexend_700Bold', marginTop: s(2) },

  bodyWrapper: {
    flex: 1,
    flexDirection: 'row',
    position: 'relative'
  },
 
  mainContent: { flex: 1, paddingHorizontal: s(60), paddingTop: s(40), paddingBottom: s(40) },

  mainWhiteBox: {
    flex: 1,
    backgroundColor: colors.cardBg,
    borderRadius: s(30),
    paddingHorizontal: s(40),
    paddingBottom: s(40),
    paddingTop: s(25),
    elevation: s(8),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 5
  },

  drawerContainer: {
    position: 'absolute',
    top: 0,    
    bottom: 0,  
    right: 0,
    width: s(550),
    zIndex: 100,
    elevation: s(15),
    shadowColor: '#000',
    shadowOffset: { width: -5, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },

  sideTab: {
    position: 'absolute',
    left: -s(60),
    top: '50%',
    marginTop: -s(115),
    backgroundColor: colors.cardBg,
    borderTopLeftRadius: s(20),
    borderBottomLeftRadius: s(20),
    paddingVertical: s(25),
    width: s(60),
    alignItems: 'center',
    elevation: s(15),
    shadowColor: '#000',
    shadowOffset: { width: -2, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 5,
  },
  rotatedTextContainer: {
    width: s(50),
    height: s(140),
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: s(15)
  },
  rotatedText: {
    width: s(140),
    textAlign: 'center',
    transform: [{ rotate: '-90deg' }],
    fontFamily: 'Lexend_700Bold',
    fontSize: s(18),
    letterSpacing: s(2),
    color: colors.textMain
  },

  drawerWhiteBox: {
    flex: 1,
    backgroundColor: colors.cardBg,
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
    paddingHorizontal: s(35),
    paddingBottom: s(35),
    paddingTop: s(40),
  },

  boxHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: s(25),
    gap: s(15)
  },
  backButton: {
    width: s(45),
    height: s(45),
    borderRadius: s(22.5),
    borderWidth: s(1.5),
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.cardBg
  },
  boxTitle: {
    fontSize: s(25),
    fontFamily: 'Lexend_700Bold',
    color: colors.textMain
  },
 
  badgePending: {
    backgroundColor: '#FFE5D9',
    paddingHorizontal: s(12),
    paddingVertical: s(4),
    borderRadius: s(20)
  },
  badgePendingText: {
    color: '#D9774B',
    fontFamily: 'Lexend_700Bold',
    fontSize: s(14)
  },
  badgeCompleted: {
    backgroundColor: '#E4F4EC',
    paddingHorizontal: s(12),
    paddingVertical: s(4),
    borderRadius: s(20)
  },
  badgeCompletedText: {
    color: '#0A5A3A',
    fontFamily: 'Lexend_700Bold',
    fontSize: s(14)
  },

  scrollView: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingBottom: s(20) },

  orderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: s(2),
    borderColor: colors.border,
    borderRadius: s(15),
    marginBottom: s(10),
    backgroundColor: colors.cardBg,
    overflow: 'hidden'
  },
  orderCardTouch: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: s(15),
    gap: s(10),
  },
 
  orderLeft: { flex: 1, justifyContent: 'center' },
  orderHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(10),
    marginBottom: s(8),
    flexWrap: 'wrap'
  },
  orderId: {
    fontFamily: 'Lexend_700Bold',
    fontSize: s(18),
    color: colors.textMain
  },
  timePill: {
    backgroundColor: colors.background,
    paddingHorizontal: s(10),
    paddingVertical: s(4),
    borderRadius: s(10)
  },
  timeText: {
    fontFamily: 'Lexend_400Regular',
    fontSize: s(14),
    color: colors.textSub
  },
  customerName: {
    fontFamily: 'Lexend_400Regular',
    fontSize: s(18),
    color: colors.textSub,
    flexShrink: 1, 
  },
  itemList: { paddingLeft: s(10) },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(6),
    marginBottom: s(4)
  },
  itemDot: {
    width: s(5),
    height: s(5),
    borderRadius: s(2.5),
    backgroundColor: colors.buttonBg
  },
  itemText: {
    fontFamily: 'Lexend_400Regular',
    fontSize: s(16),
    color: colors.textSub
  },

  orderPriceCol: { 
    alignItems: 'flex-end', 
    justifyContent: 'center', 
    paddingHorizontal: s(10), 
    gap: s(8),
    flexShrink: 1,
    maxWidth: '40%' 
  },
  orderActionCol: { paddingRight: s(15), justifyContent: 'center' },

  priceText: {
    fontFamily: 'Lexend_700Bold',
    fontSize: s(26),
    color: colors.textMain,
    textAlign: 'right' 
  },
 
  completeBtn: {
    backgroundColor: colors.buttonBg,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: s(20),
    paddingVertical: s(12),
    borderRadius: s(12),
    gap: s(8)
  },
  completeBtnText: {
    fontFamily: 'Lexend_700Bold',
    fontSize: s(16),
    color: colors.buttonText
  },
  completedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E4F4EC',
    paddingHorizontal: s(12),
    paddingVertical: s(6),
    borderRadius: s(5),
    gap: s(6)
  },
  completedTagText: {
    fontFamily: 'Lexend_700Bold',
    fontSize: s(14),
    color: '#0A5A3A'
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  receiptContainer: {
    width: width < 900 ? '70%' : '45%',
    maxHeight: '85%',
    backgroundColor: colors.cardBg,
    borderRadius: s(20),
    padding: s(35),
    elevation: s(15),
  },
  receiptHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: s(20)
  },
  receiptTitle: {
    fontFamily: 'Lexend_700Bold',
    fontSize: s(28),
    color: colors.textMain
  },
  receiptBody: { flexShrink: 1 },
  divider: {
    height: s(2),
    backgroundColor: colors.border,
    marginVertical: s(20),
  },
  receiptMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: s(10),
    gap: s(10)
  },
  receiptLabel: {
    fontFamily: 'Lexend_400Regular',
    fontSize: s(18),
    color: colors.textSub
  },
  receiptValue: {
    fontFamily: 'Lexend_700Bold',
    fontSize: s(18),
    color: colors.textMain,
    flexShrink: 1,
    textAlign: 'right'
  },
  receiptSectionTitle: {
    fontFamily: 'Lexend_700Bold',
    fontSize: s(20),
    color: colors.textMain,
    marginBottom: s(15)
  },
  receiptItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: s(15)
  },
  receiptItemLeft: { flex: 1, paddingRight: s(15) },
  receiptItemName: {
    fontFamily: 'Lexend_700Bold',
    fontSize: s(18),
    color: colors.textMain
  },
  receiptItemAddons: {
    fontFamily: 'Lexend_400Regular',
    fontSize: s(15),
    color: colors.textSub,
    marginTop: s(4)
  },
  receiptItemPrice: {
    fontFamily: 'Lexend_700Bold',
    fontSize: s(18),
    color: colors.textMain
  },
  receiptTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: s(8)
  },
  receiptTotalLabel: {
    fontFamily: 'Lexend_400Regular',
    fontSize: s(20),
    color: colors.textSub
  },
  receiptTotalValue: {
    fontFamily: 'Lexend_400Regular',
    fontSize: s(20),
    color: colors.textMain
  },
  receiptGrandTotalLabel: {
    fontFamily: 'Lexend_700Bold',
    fontSize: s(24),
    color: colors.textMain
  },
  receiptGrandTotalValue: {
    fontFamily: 'Lexend_700Bold',
    fontSize: s(24),
    color: colors.buttonBg
  },

  printBtn: {
    backgroundColor: colors.buttonBg,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: s(18),
    paddingVertical: s(9),
    borderRadius: s(10),
    gap: s(8),
  },
  printBtnText: {
    fontFamily: 'Lexend_700Bold',
    fontSize: s(16),
    color: colors.buttonText,
  },

  changeStatusBtn: {
    backgroundColor: colors.buttonBg,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: s(14),
    paddingVertical: s(12),
    marginRight: s(15),
    borderRadius: s(12),
    gap: s(5),
    minWidth: s(55),
  },
  changeStatusBtnText: {
    fontFamily: 'Lexend_700Bold',
    fontSize: s(12),
    color: colors.buttonText,
  },

  statusChangeModalContainer: {
    width: width < 900 ? '65%' : '42%',
    backgroundColor: colors.cardBg,
    borderRadius: s(20),
    padding: s(35),
    elevation: s(15),
    gap: s(20),
    alignItems: 'center',
  },
  statusChangeTitle: {
    fontFamily: 'Lexend_700Bold',
    fontSize: s(26),
    color: colors.textMain,
    textAlign: 'center',
  },
  statusChangeSubtitle: {
    fontFamily: 'Lexend_400Regular',
    fontSize: s(18),
    color: colors.textSub,
    textAlign: 'center',
  },
  statusOptionsRow: {
    flexDirection: 'row',
    gap: s(15),
    width: '100%',
  },
  statusOption: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    paddingVertical: s(20),
    paddingHorizontal: s(10),
    borderRadius: s(12),
    borderWidth: s(1),
    gap: s(8),
  },
  statusOptionText: {
    fontFamily: 'Lexend_700Bold',
    fontSize: s(16),
    textAlign: 'center',
  },
  currentStatusLabel: {
    fontFamily: 'Lexend_400Regular',
    fontSize: s(12),
    textAlign: 'center',
  },
  statusCancelBtn: {
    backgroundColor: colors.background,
    paddingVertical: s(14),
    paddingHorizontal: s(40),
    borderRadius: s(12),
    alignItems: 'center',
    width: '100%',
  },
  statusCancelBtnText: {
    fontFamily: 'Lexend_700Bold',
    fontSize: s(18),
    color: colors.textSub,
  },

});
