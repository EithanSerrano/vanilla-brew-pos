import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  LayoutAnimation,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
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
import QRCode from 'react-native-qrcode-svg';

import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, limit, orderBy, query, where, writeBatch } from 'firebase/firestore';
import { Colors } from '../constants/theme';
import { useAppTheme } from '../constants/ThemeContext';
import { db } from '../firebaseConfig';
import { createGcashPayment, GCASH_MIN_AMOUNT, GCASH_PROVIDER_LABEL, GCASH_SIMULATED, simulateGcashPaid, watchGcashPayment } from '../lib/gcashGateway';

// Enable LayoutAnimation for Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// --- HELPER FUNCTIONS ---
const getAvailableSizes = (product) => {
  if (!product || !product.variants || !Array.isArray(product.variants)) return [];
  return product.variants.map(v => v.name);
};

const getProductPrice = (product, sizeName) => {
  if (!product || !product.variants || !Array.isArray(product.variants)) return 0;
  const foundVariant = product.variants.find(v => v.name === sizeName);
  return foundVariant ? parseFloat(foundVariant.price) || 0 : 0;
};

export default function SalesScreen() {
  const router = useRouter();
  
  const { appTheme } = useAppTheme();
  const currentColors = Colors[appTheme] || Colors.light;

  const { width, height } = useWindowDimensions();
  const scaleRatio = Math.min(width / 1180, 1); 
  const s = (size) => Math.max(Math.round(size * scaleRatio), 1); 
  const styles = useMemo(() => getStyles(s, width, height, currentColors), [width, height, appTheme]);

  const [menuData, setMenuData] = useState([]);
  const [dbCategories, setDbCategories] = useState([]);
  const [loadingMenu, setLoadingMenu] = useState(true);
  const [cashierName, setCashierName] = useState('Unknown Cashier');

  // Real-time clock state
  const [currentTime, setCurrentTime] = useState(new Date());

  // Dynamic QR States
  const [dynamicQRs, setDynamicQRs] = useState({ gcash: null, maya: null });

  const [orderMode, setOrderMode] = useState('TakeOut');
  
  const [currentParent, setCurrentParent] = useState(null);
  const [currentCategory, setCurrentCategory] = useState(null);
  
  const [modalVisible, setModalVisible] = useState(false);
  const [confirmTransactionVisible, setConfirmTransactionVisible] = useState(false);
  const [finalReceiptVisible, setFinalReceiptVisible] = useState(false);
  const [isSummaryView, setIsSummaryView] = useState(false); 
  
  const [cart, setCart] = useState([]);
  const [editingId, setEditingId] = useState(null); 
  const [activeItem, setActiveItem] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [selectedSize, setSelectedSize] = useState(''); 
  const [selectedAddons, setSelectedAddons] = useState({});
  const [selectedSugarLevel, setSelectedSugarLevel] = useState(100);

  const [paymentMethod, setPaymentMethod] = useState('Cash'); 
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [amountGiven, setAmountGiven] = useState('');
  const [paymentError, setPaymentError] = useState(false);

  const [customerName, setCustomerName] = useState('');
  const [nameError, setNameError] = useState(false);
  const [customerType, setCustomerType] = useState('Regular');
  
  const [deliveryPartner, setDeliveryPartner] = useState(null);
  const [partnerError, setPartnerError] = useState(false);
  
  // Transaction Recording States
  const [transactionTime, setTransactionTime] = useState(null);
  const [savedTxNumber, setSavedTxNumber] = useState('');
  const [isProcessingTx, setIsProcessingTx] = useState(false);

  const [promotions, setPromotions] = useState([]);

  // GCash gateway: status is 'idle' | 'creating' | 'pending' | 'paid' | 'error'
  const [gcash, setGcash] = useState({ status: 'idle', paymentId: null, checkoutUrl: null });
  const [gcashAttempt, setGcashAttempt] = useState(0);
  const finalizeRef = useRef(null);
  const gcashAmountRef = useRef(0);

  let [fontsLoaded] = useFonts({ Lexend_400Regular, Lexend_700Bold });

  // Update time every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const auth = getAuth();
    const unsubscribeCashier = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            setCashierName(userDoc.data().name || user.email);
          } else {
            setCashierName(user.email);
          }
        } catch (error) {
          console.error("Could not fetch cashier info", error);
        }
      }
    });
    return () => unsubscribeCashier();
  }, []);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, "categories"));
        const fetchedCats = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setDbCategories(fetchedCats);
      } catch (error) {
        console.error("Error fetching categories: ", error);
      }
    };
    
    const fetchMenuData = async () => {
      try {
        const [menuSnapshot, ingSnapshot] = await Promise.all([
          getDocs(collection(db, "menuItems")),
          getDocs(collection(db, "ingredients")),
        ]);

        // Build lookup map for ingredients by id
        const ingredientsMap = {};
        ingSnapshot.forEach((d) => { ingredientsMap[d.id] = d.data(); });

        const fetchedMenu = [];

        menuSnapshot.forEach((doc) => {
          const data = doc.data();
          if (data.isActive !== false && data.isAvailable !== false) {
            const variants = data.variants || [];
            // Detect if any variant connection references an ingredient with hasLevels: true
            const hasSugar = variants.some((v) =>
              (v.connections || []).some((conn) => {
                if (conn.type === 'ingredient' && conn.refId) {
                  const ing = ingredientsMap[conn.refId];
                  if (ing && ing.hasLevels === true) return true;
                }
                return false;
              })
            );

            fetchedMenu.push({
              id: doc.id,
              ...data,
              variants,
              addOns: data.addOns || [],
              hasSugar,
            });
          }
        });
        setMenuData(fetchedMenu);
      } catch (error) {
        console.error("Error fetching menu: ", error);
      } finally {
        setLoadingMenu(false);
      }
    };

    const fetchQRs = async () => {
      try {
        const qrDoc = await getDoc(doc(db, 'settings', 'paymentQR'));
        if (qrDoc.exists()) {
          setDynamicQRs({
            gcash: qrDoc.data().gcashBase64 || null,
            maya: qrDoc.data().mayaBase64 || null
          });
        }
      } catch (error) {
        console.error("Error fetching QRs", error);
      }
    };

    // FIX: Fetch ALL active promotions without date filters (web app does not save
    // startDate/endDate). Match both 'item' promos (by menuItemName) and 'category'
    // promos (by categoryName) so no promo type is silently ignored.
    const fetchPromotions = async () => {
      try {
        const snap = await getDocs(
          query(collection(db, 'promotions'), where('isActive', '==', true))
        );
        const now = new Date();
        const active = [];
        snap.forEach(d => {
          const p = { id: d.id, ...d.data() };
          // Skip documents that are missing the required promoId (malformed docs)
          if (!p.promoId) return;
          // Honor optional date gates only when the fields actually exist
          const afterStart = !p.startDate || p.startDate.toDate() <= now;
          const beforeEnd  = !p.endDate   || p.endDate.toDate()   >= now;
          if (afterStart && beforeEnd) active.push(p);
        });
        setPromotions(active);
      } catch (error) {
        console.error("Error fetching promotions:", error);
      }
    };

    fetchCategories();
    fetchMenuData();
    fetchQRs();
    fetchPromotions();
  }, []);

  // Start a GCash gateway payment when the cashier reaches the GCash QR step
  const gcashModalOpen = confirmTransactionVisible && paymentMethod === 'E-Wallet' && selectedProvider === 'GCash';
  useEffect(() => {
    if (!gcashModalOpen || gcashAmountRef.current < GCASH_MIN_AMOUNT) {
      setGcash({ status: 'idle', paymentId: null, checkoutUrl: null });
      return;
    }
    let cancelled = false;
    let unsubscribe = null;
    setGcash({ status: 'creating', paymentId: null, checkoutUrl: null });

    createGcashPayment(gcashAmountRef.current, `POS-${Date.now()}`)
      .then(({ paymentId, checkoutUrl }) => {
        if (cancelled) return;
        setGcash({ status: 'pending', paymentId, checkoutUrl });
        unsubscribe = watchGcashPayment(
          paymentId,
          (status) => {
            if (cancelled || status !== 'paid') return;
            setGcash((prev) => ({ ...prev, status: 'paid' }));
            cancelled = true; // guard against a duplicate finalize on later snapshots
            finalizeRef.current?.();
          },
          () => !cancelled && setGcash((prev) => ({ ...prev, status: 'error' }))
        );
      })
      .catch((err) => {
        console.error('GCash gateway error:', err);
        if (!cancelled) setGcash({ status: 'error', paymentId: null, checkoutUrl: null });
      });

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
    // The amount is fixed once the cashier is on the payment step
  }, [gcashModalOpen, gcashAttempt]);

  // --- CATEGORY LOGIC RE-IMPLEMENTED ---
  const topLevelCategories = useMemo(() => {
    if (dbCategories.length === 0) {
      const uniqueCats = [...new Set(menuData.map(item => item.category))].filter(Boolean);
      return uniqueCats.map(c => ({ id: c, name: c, isParent: false }));
    }
    
    const mains = dbCategories
      .filter(c => !c.parentId || c.parentId === "")
      .sort((a, b) => a.name.localeCompare(b.name));
      
    const dbCatNames = new Set(dbCategories.map(c => c.name));
    const orphanCats = [...new Set(menuData.map(item => item.category))].filter(c => c && !dbCatNames.has(c));
    const orphans = orphanCats.map(c => ({ id: c, name: c, isParent: false }));
    
    return [...mains, ...orphans];
  }, [dbCategories, menuData]);

  const subCategories = useMemo(() => {
    if (!currentParent) return [];
    
    return dbCategories
      .filter(c => c.parentId === currentParent.id || c.parentId === currentParent.name)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [dbCategories, currentParent]);

  if (!fontsLoaded || loadingMenu) {
    return (
      <View style={{ flex: 1, backgroundColor: currentColors.containerBg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={currentColors.buttonBg} />
      </View>
    );
  }

  const formattedDate = currentTime.toLocaleDateString('en-US', { 
    weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' 
  });
  
  const formattedTime = currentTime.toLocaleTimeString('en-US', { 
    hour: 'numeric', minute: '2-digit', second: '2-digit' 
  });

  // ANIMATED STATE HANDLERS
  const toggleSummaryView = (val) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsSummaryView(val);
  };

  const handleSelectCategory = (catName) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const catObj = dbCategories.find(c => c.name === catName);

    // Double check if this category has subcategories relying on it
    const hasSubs = catObj ? dbCategories.some(c => c.parentId === catObj.id || c.parentId === catObj.name) : false;

    if (catObj && (catObj.isParent === true || catObj.isParent === "true" || hasSubs)) {
      setCurrentParent(catObj);
      setCurrentCategory(null);
    } else {
      setCurrentCategory(catName);
    }
  };

  const handleBack = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (currentCategory !== null) {
      if (currentParent !== null) {
        setCurrentCategory(null);
      } else {
        setCurrentCategory(null);
      }
    } else if (currentParent !== null) {
      setCurrentParent(null);
    }
  };

  const increment = () => setQuantity(prev => prev + 1);
  const decrement = () => setQuantity(prev => (prev > 1 ? prev - 1 : 1));

  const openCustomization = (product) => {
    const availableSizes = getAvailableSizes(product);
    setEditingId(null); 
    setActiveItem(product);
    setQuantity(1);
    setSelectedSize(availableSizes[0] || ''); 
    setSelectedAddons({});
    setSelectedSugarLevel(100);
    setModalVisible(true);
  };

  const openEditCustomization = (item) => {
    setEditingId(item.id);
    setActiveItem(item.product);
    setSelectedSize(item.size);
    const addonObj = {};
    if (item.addons) {
      item.addons.split(', ').forEach(str => {
        const match = str.match(/^(\d+)x (.+)$/);
        if (match) addonObj[match[2]] = parseInt(match[1], 10);
        else addonObj[str] = 1;
      });
    }
    setSelectedAddons(addonObj);
    setSelectedSugarLevel(item.sugarLevel ?? 100);
    setQuantity(item.qty);
    setModalVisible(true);
  };

  const toggleAddon = (name) => {
    setSelectedAddons(prev => ({ ...prev, [name]: 1 }));
  };

  const incrementAddon = (name) => {
    setSelectedAddons(prev => ({ ...prev, [name]: Math.min((prev[name] || 0) + 1, 4) }));
  };

  const decrementAddon = (name) => {
    setSelectedAddons(prev => {
      const newQty = (prev[name] || 0) - 1;
      if (newQty <= 0) {
        const { [name]: _removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [name]: newQty };
    });
  };

  const handleConfirmOrder = () => {
    const categoryAddons = activeItem?.addOns || [];
    const calcAddonTotal = (addonMap) => Object.entries(addonMap).reduce((sum, [name, qty]) => {
      const found = categoryAddons.find(a => a.name === name);
      return sum + (found ? parseFloat(found.price) * qty : 0);
    }, 0);

    const pricePerUnit = getProductPrice(activeItem, selectedSize) + calcAddonTotal(selectedAddons);
    const addonsStr = Object.entries(selectedAddons)
      .map(([name, qty]) => qty > 1 ? `${qty}x ${name}` : name)
      .join(', ');
    const existingIndex = cart.findIndex(i => i.name === activeItem.name && i.size === selectedSize && i.addons === addonsStr && i.id !== editingId);

    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); // Animate cart update
    
    if (existingIndex !== -1 && !editingId) {
      const updated = [...cart];
      updated[existingIndex].qty += quantity;
      updated[existingIndex].totalPrice += (pricePerUnit * quantity);
      setCart(updated);
    } else if (editingId) {
      setCart(cart.map(item => item.id === editingId ? { id: editingId, name: activeItem.name, product: activeItem, size: selectedSize, qty: quantity, addons: addonsStr, totalPrice: pricePerUnit * quantity, isDiscounted: item.isDiscounted, sugarLevel: activeItem.hasSugar ? selectedSugarLevel : null } : item));
    } else {
      setCart([...cart, { id: Date.now(), name: activeItem.name, product: activeItem, size: selectedSize, qty: quantity, addons: addonsStr, totalPrice: pricePerUnit * quantity, isDiscounted: false, sugarLevel: activeItem.hasSugar ? selectedSugarLevel : null }]);
    }
    setModalVisible(false);
  };

  const handleRemove = () => {
    if (editingId) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); // Animate cart update
      setCart(cart.filter(i => i.id !== editingId));
    }
    setModalVisible(false);
  };

  const resetAll = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setFinalReceiptVisible(false); 
    setIsSummaryView(false); 
    setCart([]); 
    setAmountGiven(''); 
    setPaymentMethod('Cash'); 
    setSelectedProvider(null); 
    setOrderMode('TakeOut'); 
    setDeliveryPartner(null); 
    setCurrentCategory(null); 
    setCurrentParent(null);
    setCustomerName(''); 
    setCustomerType('Regular');
    setTransactionTime(null);
    setSavedTxNumber('');
  };

  // --- VAT & DISCOUNT CALCULATION ---
  const subTotal = cart.reduce((sum, item) => sum + item.totalPrice, 0);

  // promoAddition accounts for zero-priced variants whose charge comes from the promo bundlePrice
  // It must be computed before discountAmount so the discount base is correct
  const earlyPromoAddition = (() => {
    let total = 0;
    cart.forEach(item => {
      const variantPrice = getProductPrice(item.product, item.size);
      if (variantPrice > 0) return;
      // Find a matching promo for this item
      const match = promotions.find(p => {
        const qtyOk = item.qty >= p.triggerQty;
        if (!qtyOk) return false;
        if (p.promoType === 'category') {
          return p.categoryName && (item.product?.category || '') === p.categoryName &&
            (!p.variantName || p.variantName === item.size);
        }
        return p.menuItemName === item.name && (!p.variantName || p.variantName === item.size);
      });
      if (match) {
        const bundles = Math.floor(item.qty / match.triggerQty);
        total += bundles * match.bundlePrice;
      }
    });
    return total;
  })();

  const discountBase = subTotal + earlyPromoAddition;
  let discountAmount = 0;
  if (customerType === 'Senior' || customerType === 'PWD') {
    if (discountBase > 0) {
      const vatExclusive = discountBase / 1.12;
      const finalDiscountedPrice = vatExclusive * 0.80;
      discountAmount = discountBase - finalDiscountedPrice;
    }
  }

  // FIX: Match cart items against promotions for BOTH 'item' and 'category' promo types.
  // The web admin saves promos with promoType: 'item' (matched by menuItemName) or
  // promoType: 'category' (matched by categoryName against the cart item's product category).
  const cartItemPromos = cart.map(item => {
    const match = promotions.find(p => {
      const qtyOk = item.qty >= p.triggerQty;
      if (!qtyOk) return false;

      if (p.promoType === 'category') {
        // Category promo: check the cart item's product category matches
        const itemCategory = item.product?.category || '';
        const categoryMatches = p.categoryName && itemCategory === p.categoryName;
        // variantName on category promos is a size/variant filter (optional)
        const variantMatches = !p.variantName || p.variantName === item.size;
        return categoryMatches && variantMatches;
      }

      // Default: item promo (promoType === 'item' or legacy docs without promoType)
      const nameMatches = p.menuItemName === item.name;
      const variantMatches = !p.variantName || p.variantName === item.size;
      return nameMatches && variantMatches;
    });

    if (!match) return null;
    const variantPrice = getProductPrice(item.product, item.size);
    const regularPricePerUnit = variantPrice > 0 ? variantPrice : (item.totalPrice / item.qty);
    const bundles = Math.floor(item.qty / match.triggerQty);
    const remaining = item.qty % match.triggerQty;
    // When the variant price is 0, the bundlePrice IS the intended charge for a full bundle;
    // remaining items outside the bundle are free (price 0) in that case.
    const discountedTotal = (bundles * match.bundlePrice) + (remaining * regularPricePerUnit);
    const effectiveTotal = regularPricePerUnit > 0 ? item.totalPrice : (bundles * match.bundlePrice);
    const promoAddition = regularPricePerUnit > 0 ? 0 : effectiveTotal;
    return { cartItemId: item.id, promoName: match.name, discountedTotal, savings: effectiveTotal - discountedTotal, promoAddition };
  }).filter(Boolean);

  let promoDiscount = 0;
  let promoAddition = 0; // bundle charges for items whose variant price is 0
  cartItemPromos.forEach(p => {
    promoDiscount += p.savings;
    if (p.promoAddition) promoAddition += p.promoAddition;
  });

  const grandTotal = parseFloat(Math.max(0, subTotal + promoAddition - discountAmount - promoDiscount).toFixed(2));
  gcashAmountRef.current = grandTotal;
  const changeAmount = amountGiven ? (parseFloat(amountGiven) - grandTotal) : 0;

  const handleProcessPayment = () => {
    if (!orderMode) return; 
    
    if (orderMode === 'Delivery' && !deliveryPartner) {
      setPartnerError(true);
      return;
    }

    if (customerName.trim() === '') {
      setNameError(true);
      return;
    }

    if (paymentMethod === 'Cash') {
      const given = parseFloat(amountGiven);
      if (isNaN(given) || given < grandTotal) {
        setPaymentError(true);
        return;
      }
    } else if (paymentMethod === 'E-Wallet' || paymentMethod === 'Bank') {
      if (!selectedProvider) {
        setPaymentError(true);
        return;
      }
    }
    
    setNameError(false);
    setPaymentError(false);
    setPartnerError(false);
    setConfirmTransactionVisible(true);
  };

  const generateTransactionNumber = async (currentDate) => {
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const day = String(currentDate.getDate()).padStart(2, '0');
    const year = String(currentDate.getFullYear()).slice(-2);
    const datePrefix = `SLS${month}${day}${year}`;

    const startOfDay = new Date(currentDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(currentDate);
    endOfDay.setHours(23, 59, 59, 999);

    const q = query(
      collection(db, "salestransaction"),
      where("createdAt", ">=", startOfDay),
      where("createdAt", "<=", endOfDay),
      orderBy("createdAt", "desc"),
      limit(1)
    );

    let nextSequence = 1;

    try {
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        const lastDoc = querySnapshot.docs[0].data();
        const lastTxNumber = lastDoc.transactionNumber;
        if (lastTxNumber && lastTxNumber.startsWith(datePrefix)) {
          const lastSequence = parseInt(lastTxNumber.slice(-4), 10);
          if (!isNaN(lastSequence)) {
            nextSequence = lastSequence + 1;
          }
        }
      }
    } catch (err) {
      console.error("Error generating transaction number sequence:", err);
    }

    return `${datePrefix}${String(nextSequence).padStart(4, '0')}`;
  };

  const handleConfirmComplete = async () => {
    setIsProcessingTx(true);
    
    try {
      const currentDate = new Date();
      
      const formattedTimeForDB = currentDate.toLocaleString('en-US', { 
        year: 'numeric', month: 'short', day: 'numeric', 
        hour: '2-digit', minute: '2-digit', second: '2-digit' 
      });

      const txNumber = await generateTransactionNumber(currentDate);
      const finalOrderMode = orderMode === 'Delivery' ? `For Delivery - ${deliveryPartner}` : 'Take Out';
      const finalPaymentMode = paymentMethod === 'Cash' ? 'Cash' : `${paymentMethod} - ${selectedProvider}`;
      
      const cleanOrders = cart.map(item => {
        const promoEntry = cartItemPromos.find(p => p.cartItemId === item.id);
        const effectivePrice = promoEntry ? promoEntry.discountedTotal : item.totalPrice;
        return {
          name: item.name,
          size: item.size,
          qty: item.qty,
          addons: item.addons,
          totalPrice: item.totalPrice,
          effectivePrice,
          ...(item.sugarLevel !== null && item.sugarLevel !== undefined ? { sugarLevel: item.sugarLevel } : {}),
        };
      });

      const transactionPayload = {
        customerName: customerName.trim(),
        customerType: customerType,
        orders: cleanOrders,
        transactionNumber: txNumber,
        orderMode: finalOrderMode,
        modeOfPayment: finalPaymentMode,
        dateAndTimeStr: formattedTimeForDB,
        createdAt: currentDate,
        subTotal: subTotal,
        discountAmount: parseFloat(discountAmount.toFixed(2)),
        promoDiscountAmount: parseFloat(promoDiscount.toFixed(2)),
        appliedPromotions: cartItemPromos.map(p => ({ promoName: p.promoName, savings: parseFloat(p.savings.toFixed(2)) })),
        totalAmount: grandTotal,
        ...(paymentMethod === 'Cash' && {
          cashTendered: parseFloat(parseFloat(amountGiven).toFixed(2)),
          changeGiven: parseFloat(changeAmount.toFixed(2)),
        }),
        cashierName: cashierName,
        cashierUid: getAuth().currentUser?.uid || null,
        ...(gcash.status === 'paid' && gcash.paymentId && { gatewayPaymentId: gcash.paymentId, gatewayProvider: GCASH_PROVIDER_LABEL }),
        status: 'Ongoing'
      };

      // Single atomic batch: the transaction and its per-item logs either all save or none do
      const batch = writeBatch(db);
      batch.set(doc(db, 'salestransaction', txNumber), transactionPayload);
      const dateKey = currentDate.toISOString().split('T')[0];
      cart.forEach((item, idx) => {
        batch.set(doc(db, 'daily_sales_logs', `${txNumber}_${idx + 1}`), {
          date: dateKey,
          timestamp: currentDate,
          itemName: item.name,
          size: item.size,
          qty: item.qty,
          price: item.totalPrice,
          customerType: customerType,
          transactionNumber: txNumber
        });
      });
      await batch.commit();
      
      setSavedTxNumber(txNumber);
      setTransactionTime(formattedTimeForDB);
      setConfirmTransactionVisible(false);
      setFinalReceiptVisible(true);

      printTransactionReceipt({
        txNumber,
        dateStr: formattedTimeForDB,
        cashierName,
        customerName: customerName.trim(),
        customerType,
        orderMode: finalOrderMode,
        paymentMode: finalPaymentMode,
        orders: cleanOrders,
        subTotal,
        discountAmount: parseFloat(discountAmount.toFixed(2)),
        promoDiscountAmount: parseFloat(promoDiscount.toFixed(2)),
        totalAmount: grandTotal,
        ...(paymentMethod === 'Cash' && {
          cashTendered: parseFloat(parseFloat(amountGiven).toFixed(2)),
          changeGiven: parseFloat(changeAmount.toFixed(2)),
        }),
      });
      
    } catch (error) {
      console.error("Failed to save transaction:", error);
      alert("Error saving transaction. Please try again.");
    } finally {
      setIsProcessingTx(false);
    }
  };

  // While the gateway is live for GCash, only a confirmed payment may complete the sale
  const gcashLocked = selectedProvider === 'GCash' && ['creating', 'pending', 'paid'].includes(gcash.status);

  finalizeRef.current = () => {
    if (!isProcessingTx) handleConfirmComplete();
  };

  const printTransactionReceipt = async (data) => {
    const itemsHtml = data.orders.map(item => `
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
      data.discountAmount > 0
        ? `<div class="row total-line"><span>Discount (${data.customerType}):</span><span>-&#8369;${data.discountAmount.toFixed(2)}</span></div>`
        : '',
      data.promoDiscountAmount > 0
        ? `<div class="row total-line"><span>Promo Savings:</span><span>-&#8369;${data.promoDiscountAmount.toFixed(2)}</span></div>`
        : '',
    ].join('');

    const receiptHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Receipt ${data.txNumber}</title>
  <style>
    @page { size: 58mm auto; margin: 3mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { width: 52mm; font-family: 'Courier New', Courier, monospace; font-size: 8pt; color: #000; line-height: 1.4; }
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
  <div class="tx-num">${data.txNumber}</div>
  <div class="meta">${data.dateStr}</div>
  <div class="meta">Cashier: ${data.cashierName}</div>
  <div class="meta">Customer: ${data.customerName}</div>
  <div class="meta">Type: ${data.customerType}</div>
  <div class="meta">Mode: ${data.orderMode}</div>
  <div class="meta">Payment: ${data.paymentMode}</div>
  <hr class="divider">
  <div class="section-title">ORDER ITEMS</div>
  ${itemsHtml}
  <hr class="divider">
  ${discountHtml ? `<div class="row total-line"><span>Subtotal:</span><span>&#8369;${data.orders.reduce((s, i) => s + ((i.effectivePrice ?? i.totalPrice) || 0), 0).toFixed(2)}</span></div>` : ''}
  ${discountHtml}
  <div class="row grand-total-line"><span>TOTAL:</span><span>&#8369;${data.totalAmount.toFixed(2)}</span></div>
  ${data.cashTendered != null ? `
  <div class="row total-line"><span>Cash Tendered:</span><span>&#8369;${data.cashTendered.toFixed(2)}</span></div>
  <div class="row total-line"><span>Change:</span><span>&#8369;${(data.changeGiven < 0 ? 0 : data.changeGiven).toFixed(2)}</span></div>
  ` : ''}
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

  const renderProductList = (category) => {
    const products = menuData.filter(item => item.category === category);
    return (
      <>
        <View style={styles.columnHeaderWithBack}>
          <TouchableOpacity style={styles.goBackButton} onPress={handleBack}>
            <Text style={styles.goBackText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.columnHeaderText}>{category}</Text>
          <View style={{ width: s(100) }} />
        </View>
        <ScrollView contentContainerStyle={styles.menuList}>
          {products.map((p) => {
            // FIX: Show promos for this product from both item promos and category promos
            const itemPromos = promotions.filter(promo => {
              if (promo.promoType === 'category') {
                return promo.categoryName === p.category;
              }
              return promo.menuItemName === p.name;
            });
            return (
              <TouchableOpacity key={p.id} style={styles.productItem} onPress={() => openCustomization(p)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.productItemText}>{p.name}</Text>
                  <Text style={styles.productPriceText}>
                    {getAvailableSizes(p).map(sz => `${sz}: ₱${getProductPrice(p, sz)}`).join(' | ')}
                  </Text>
                  {itemPromos.map(promo => (
                    <View key={promo.id} style={{ flexDirection: 'row', alignItems: 'center', gap: s(4), marginTop: s(3) }}>
                      <Ionicons name="pricetag-outline" size={s(13)} color="#06BC2E" />
                      <Text style={{ color: '#06BC2E', fontSize: s(13), fontFamily: 'Lexend_400Regular' }}>
                        {promo.variantName ? `${promo.variantName}: ` : ''}{promo.triggerQty} for ₱{promo.bundlePrice}
                      </Text>
                    </View>
                  ))}

                </View>
                <Ionicons name="add-circle-outline" size={s(32)} color="#AD725B" />
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* --- TOP TOOLBAR --- */}
      <View style={styles.topToolbar}>
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => {
            if (isSummaryView) {
              toggleSummaryView(false);
            } else if (cart.length > 0) {
              Alert.alert(
                'Cancel Order',
                'Are you sure you want to cancel? Your current order will be cleared.',
                [
                  { text: 'Stay', style: 'cancel' },
                  { text: 'Cancel Order', style: 'destructive', onPress: () => { resetAll(); router.replace('/home'); } },
                ]
              );
            } else {
              router.replace('/home');
            }
          }}
        >
          <Ionicons name={isSummaryView ? "arrow-back-circle-outline" : "close-circle-outline"} size={s(40)} color={currentColors.textMain} />
          <Text style={styles.toolbarText}>{isSummaryView ? "Menu" : "Cancel"}</Text>
        </TouchableOpacity>
        
        <View style={styles.dateTimeContainer}>
          <Text style={styles.dateTextTop}>{formattedDate}</Text>
          <Text style={styles.timeTextBottom}>{formattedTime}</Text>
        </View>
      </View>

      <View style={styles.mainGrid}>
        {!isSummaryView ? (
          <>
            <View style={styles.menuColumn}>
              {currentParent === null && currentCategory === null ? (
                <>
                  <View style={styles.columnHeader}><Text style={styles.columnHeaderText}>Menu Categories</Text></View>
                  <ScrollView contentContainerStyle={styles.menuList}>
                    {topLevelCategories.map((c) => (
                      <TouchableOpacity key={c.id} style={styles.menuItem} onPress={() => handleSelectCategory(c.name)}>
                        <Ionicons name="list-outline" size={s(28)} color={currentColors.buttonBg} />
                        <Text style={styles.menuItemText}>{c.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </>
              ) : currentParent !== null && currentCategory === null ? (
                <>
                  <View style={styles.columnHeaderWithBack}>
                    <TouchableOpacity style={styles.goBackButton} onPress={handleBack}>
                      <Text style={styles.goBackText}>Back</Text>
                    </TouchableOpacity>
                    <Text style={styles.columnHeaderText}>{currentParent.name}</Text>
                    <View style={{ width: s(100) }} />
                  </View>
                  <ScrollView contentContainerStyle={styles.menuList}>
                    {subCategories.map((c) => (
                      <TouchableOpacity key={c.id} style={styles.menuItem} onPress={() => handleSelectCategory(c.name)}>
                        <Ionicons name="list-outline" size={s(28)} color={currentColors.buttonBg} />
                        <Text style={styles.menuItemText}>{c.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </>
              ) : (
                renderProductList(currentCategory)
              )}
            </View>

            {/* ORDER LIST COLUMN */}
            <View style={styles.orderColumn}>
              <View style={styles.columnHeader}><Text style={styles.columnHeaderText}>Order List</Text></View>
              <ScrollView style={[styles.orderListContainer, { flexGrow: 1, flexShrink: 1 }]}>
                {cart.map((item) => {
                  const itemPromo = cartItemPromos.find(p => p.cartItemId === item.id);
                  const displayPrice = itemPromo
                    ? itemPromo.discountedTotal
                    : item.totalPrice;
                  return (
                  <TouchableOpacity key={item.id} style={styles.cartItem} onPress={() => openEditCustomization(item)}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cartItemName}>{item.qty} x {item.size} {item.name}</Text>
                      {item.addons !== "" && <Text style={styles.cartItemAddons}>{item.addons}</Text>}
                      {item.sugarLevel !== null && item.sugarLevel !== undefined && (
                        <Text style={styles.cartItemAddons}>Sugar: {item.sugarLevel}%</Text>
                      )}
                      {itemPromo && <Text style={{ color: '#06BC2E', fontSize: s(13), fontFamily: 'Lexend_400Regular' }}>{itemPromo.promoName}</Text>}
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: s(5) }}>
                      {itemPromo && item.totalPrice > 0 && (
                        <Text style={[styles.cartItemPrice, { textDecorationLine: 'line-through', color: currentColors.textSub, fontSize: s(14) }]}>P {item.totalPrice.toFixed(2)}</Text>
                      )}
                      <Text style={[styles.cartItemPrice, itemPromo && { color: '#06BC2E' }]}>P {displayPrice.toFixed(2)}</Text>
                    </View>
                  </TouchableOpacity>
                  );
                })}
              </ScrollView>
              <View style={styles.orderFooter}>
                <Text style={styles.totalText}>Total: ₱{grandTotal.toFixed(2)}</Text>
                <TouchableOpacity style={[styles.buttonPrimaryFull, cart.length === 0 && { opacity: 0.3 }]} onPress={() => toggleSummaryView(true)} disabled={cart.length === 0}>
                  <Text style={styles.buttonTextBold}>Complete Order</Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        ) : (
          <>
            {/* LEFT COLUMN: ACTION ZONE */}
            <View style={styles.menuColumn}>
              <View style={styles.columnHeader}><Text style={styles.columnHeaderText}>Checkout Actions</Text></View>
              <ScrollView contentContainerStyle={{ padding: s(30), gap: s(25) }} showsVerticalScrollIndicator={false}>
                
                {/* Order Mode Selection */}
                <View>
                  <Text style={styles.paymentLabel}>Order Mode:</Text>
                  <View style={[styles.methodToggleRow, { marginTop: s(10) }]}>
                    <TouchableOpacity style={[styles.methodToggleBtn, orderMode === 'TakeOut' && styles.methodToggleBtnActive]} onPress={() => { setOrderMode('TakeOut'); setDeliveryPartner(null); setPartnerError(false); }}>
                      <Text style={[styles.methodToggleText, orderMode === 'TakeOut' && styles.methodToggleTextActive]}>Take Out</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.methodToggleBtn, orderMode === 'Delivery' && styles.methodToggleBtnActive]} onPress={() => setOrderMode('Delivery')}>
                      <Text style={[styles.methodToggleText, orderMode === 'Delivery' && styles.methodToggleTextActive]}>For Delivery</Text>
                    </TouchableOpacity>
                  </View>
                  {!orderMode && <Text style={[styles.errorTextSmall, { marginTop: s(5) }]}>* Order Mode is required.</Text>}
                  
                  {orderMode === 'Delivery' && (
                    <View style={{ marginTop: s(15) }}>
                      <Text style={[styles.paymentLabel, { fontSize: s(22) }]}>Delivery Partner:</Text>
                      <View style={styles.eWalletRow}>
                        <TouchableOpacity style={[styles.eWalletButton, deliveryPartner === 'Foodpanda' && styles.eWalletSelected, partnerError && !deliveryPartner && styles.inputError]} onPress={() => { setDeliveryPartner('Foodpanda'); setPartnerError(false); }}>
                          <Image source={require('../assets/images/foodpanda.png')} style={styles.eWalletLogo} />
                          <Text style={[styles.eWalletLabel, deliveryPartner === 'Foodpanda' && styles.eWalletLabelSelected]}>Foodpanda</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.eWalletButton, deliveryPartner === 'GrabFood' && styles.eWalletSelected, partnerError && !deliveryPartner && styles.inputError]} onPress={() => { setDeliveryPartner('GrabFood'); setPartnerError(false); }}>
                          <Image source={require('../assets/images/grabfood.jpg')} style={styles.eWalletLogo} />
                          <Text style={[styles.eWalletLabel, deliveryPartner === 'GrabFood' && styles.eWalletLabelSelected]}>GrabFood</Text>
                        </TouchableOpacity>
                      </View>
                      {partnerError && !deliveryPartner && <Text style={styles.errorTextSmall}>Please select a delivery partner.</Text>}
                    </View>
                  )}
                </View>

                {/* Customer Name */}
                <View>
                  <Text style={styles.paymentLabel}>Customer Name:</Text>
                  <TextInput
                    style={[styles.checkoutInput, nameError && styles.inputError, { marginTop: s(10) }]}
                    placeholder="Enter customer name..."
                    placeholderTextColor={currentColors.textSub}
                    value={customerName}
                    onChangeText={(text) => {
                      setCustomerName(text);
                      if (text.trim() !== '') setNameError(false);
                    }}
                  />
                  {nameError && <Text style={styles.errorTextSmall}>Customer name is required before proceeding.</Text>}
                </View>

                {/* Customer Type */}
                <View>
                  <Text style={styles.paymentLabel}>Customer Type:</Text>
                  <View style={[styles.methodToggleRow, { marginTop: s(10) }]}>
                    <TouchableOpacity style={[styles.methodToggleBtn, customerType === 'Regular' && styles.methodToggleBtnActive]} onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setCustomerType('Regular'); }}>
                      <Text style={[styles.methodToggleText, customerType === 'Regular' && styles.methodToggleTextActive]}>Regular</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.methodToggleBtn, customerType === 'Senior' && styles.methodToggleBtnActive]} onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setCustomerType('Senior'); }}>
                      <Text style={[styles.methodToggleText, customerType === 'Senior' && styles.methodToggleTextActive]}>Senior</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.methodToggleBtn, customerType === 'PWD' && styles.methodToggleBtnActive]} onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setCustomerType('PWD'); }}>
                      <Text style={[styles.methodToggleText, customerType === 'PWD' && styles.methodToggleTextActive]}>PWD</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Payment Method */}
                <View>
                  <Text style={styles.paymentLabel}>Payment Method:</Text>
                  <View style={[styles.methodToggleRow, { marginTop: s(10) }]}>
                    <TouchableOpacity style={[styles.methodToggleBtn, paymentMethod === 'Cash' && styles.methodToggleBtnActive]} onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setPaymentMethod('Cash'); setSelectedProvider(null); setPaymentError(false); }}>
                      <Text style={[styles.methodToggleText, paymentMethod === 'Cash' && styles.methodToggleTextActive]}>Cash</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.methodToggleBtn, paymentMethod === 'E-Wallet' && styles.methodToggleBtnActive]} onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setPaymentMethod('E-Wallet'); setAmountGiven(''); setSelectedProvider(null); setPaymentError(false); }}>
                      <Text style={[styles.methodToggleText, paymentMethod === 'E-Wallet' && styles.methodToggleTextActive]}>E-Wallet</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.methodToggleBtn, paymentMethod === 'Bank' && styles.methodToggleBtnActive]} onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setPaymentMethod('Bank'); setAmountGiven(''); setSelectedProvider(null); setPaymentError(false); }}>
                      <Text style={[styles.methodToggleText, paymentMethod === 'Bank' && styles.methodToggleTextActive]}>Bank</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Dynamic Payment Fields */}
                {paymentMethod === 'Cash' && (
                  <View>
                    <Text style={styles.paymentLabel}>Amount Given (₱):</Text>
                    <TextInput 
                      style={[styles.checkoutInput, paymentError && styles.inputError, { marginTop: s(10) }]} 
                      value={amountGiven} 
                      onChangeText={(val) => { 
                        const numeric = val.replace(/[^0-9.]/g, '');
                        const parts = numeric.split('.');
                        const sanitized = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : numeric;
                        setAmountGiven(sanitized); 
                        setPaymentError(false); 
                      }} 
                      keyboardType="numeric" 
                      placeholder="0.00"
                      placeholderTextColor={currentColors.textSub}
                    />
                    {paymentError && <Text style={styles.errorTextSmall}>Amount must be greater than or equal to total.</Text>}
                  </View>
                )}

                {paymentMethod === 'E-Wallet' && (
                  <View>
                    <Text style={styles.paymentLabel}>Select E-Wallet:</Text>
                    <View style={styles.eWalletRow}>
                      <TouchableOpacity style={[styles.eWalletButton, selectedProvider === 'GCash' && styles.eWalletSelected, paymentError && !selectedProvider && styles.inputError]} onPress={() => { setSelectedProvider('GCash'); setPaymentError(false); }}>
                        <Image source={require('../assets/images/gcash.jpg')} style={styles.eWalletLogo} />
                        <Text style={[styles.eWalletLabel, selectedProvider === 'GCash' && styles.eWalletLabelSelected]}>GCash</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.eWalletButton, selectedProvider === 'Maya' && styles.eWalletSelected, paymentError && !selectedProvider && styles.inputError]} onPress={() => { setSelectedProvider('Maya'); setPaymentError(false); }}>
                        <Image source={require('../assets/images/maya.png')} style={styles.eWalletLogo} />
                        <Text style={[styles.eWalletLabel, selectedProvider === 'Maya' && styles.eWalletLabelSelected]}>Maya</Text>
                      </TouchableOpacity>
                    </View>
                    {paymentError && !selectedProvider && <Text style={styles.errorTextSmall}>Please select an E-Wallet provider.</Text>}
                  </View>
                )}

                {paymentMethod === 'Bank' && (
                  <View>
                    <Text style={styles.paymentLabel}>Select Bank:</Text>
                    <View style={[styles.eWalletRow, { justifyContent: 'flex-start' }]}>
                      <TouchableOpacity style={[styles.eWalletButton, { maxWidth: '48%' }, selectedProvider === 'BDO' && styles.eWalletSelected, paymentError && !selectedProvider && styles.inputError]} onPress={() => { setSelectedProvider('BDO'); setPaymentError(false); }}>
                        <Image source={require('../assets/images/bdo.jpg')} style={styles.eWalletLogo} />
                        <Text style={[styles.eWalletLabel, selectedProvider === 'BDO' && styles.eWalletLabelSelected]}>BDO</Text>
                      </TouchableOpacity>
                    </View>
                    {paymentError && !selectedProvider && <Text style={styles.errorTextSmall}>Please select a Bank provider.</Text>}
                  </View>
                )}
              </ScrollView>
            </View>

            {/* RIGHT COLUMN: SUMMARY (40%) */}
            <View style={styles.orderColumn}>
              <View style={styles.columnHeader}><Text style={styles.columnHeaderText}>Summary</Text></View>
              <ScrollView style={[styles.orderListContainer, { flexGrow: 1, flexShrink: 1 }]}>
                {cart.map((item) => {
                  const itemPromo = cartItemPromos.find(p => p.cartItemId === item.id);
                  return (
                    <TouchableOpacity key={item.id} style={styles.cartItem} onPress={() => openEditCustomization(item)}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.cartItemName, { fontSize: s(22) }]}>{item.qty} x {item.size} {item.name}</Text>
                        {item.addons !== "" && <Text style={[styles.cartItemAddons, { fontSize: s(15) }]}>{item.addons}</Text>}
                        {itemPromo && <Text style={{ color: '#06BC2E', fontSize: s(13), fontFamily: 'Lexend_400Regular' }}>{itemPromo.promoName}</Text>}
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: s(5) }}>
                        {itemPromo ? (
                          <>
                            <Text style={[styles.cartItemPrice, { fontSize: s(18), textDecorationLine: 'line-through', color: currentColors.textSub }]}>P {(item.totalPrice > 0 ? item.totalPrice : itemPromo.promoAddition || itemPromo.discountedTotal).toFixed(2)}</Text>
                            <Text style={[styles.cartItemPrice, { fontSize: s(22), color: '#06BC2E' }]}>P {itemPromo.discountedTotal.toFixed(2)}</Text>
                          </>
                        ) : (
                          <Text style={[styles.cartItemPrice, { fontSize: s(22) }]}>P {item.totalPrice.toFixed(2)}</Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <View style={styles.orderFooter}>
                <View style={{ width: '100%', gap: s(2), marginBottom: s(10) }}>
                   {(customerType !== 'Regular' || promoDiscount > 0) && (
                      <>
                         <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text style={{ color: currentColors.textSub, fontSize: s(16), fontFamily: 'Lexend_400Regular' }}>Subtotal:</Text>
                            <Text style={{ color: currentColors.textMain, fontSize: s(18), fontFamily: 'Lexend_400Regular' }}>₱ {(subTotal + promoAddition).toFixed(2)}</Text>
                         </View>
                         {customerType !== 'Regular' && (
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                               <Text style={{ color: currentColors.textSub, fontSize: s(16), fontFamily: 'Lexend_400Regular' }}>Discount ({customerType}):</Text>
                               <Text style={{ color: '#DF0C0C', fontSize: s(18), fontFamily: 'Lexend_400Regular' }}>- ₱ {discountAmount.toFixed(2)}</Text>
                            </View>
                         )}
                         {promoDiscount > 0 && (
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                               <Text style={{ color: currentColors.textSub, fontSize: s(16), fontFamily: 'Lexend_400Regular' }}>Promo Savings:</Text>
                               <Text style={{ color: '#06BC2E', fontSize: s(18), fontFamily: 'Lexend_400Regular' }}>- ₱ {promoDiscount.toFixed(2)}</Text>
                            </View>
                         )}
                      </>
                   )}
                   <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ color: currentColors.textSub, fontSize: s(18), fontFamily: 'Lexend_400Regular' }}>Total:</Text>
                      <Text style={{ color: currentColors.textMain, fontSize: s(24), fontFamily: 'Lexend_700Bold' }}>₱ {grandTotal.toFixed(2)}</Text>
                   </View>
                   {paymentMethod === 'Cash' && (
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                         <Text style={{ color: currentColors.textSub, fontSize: s(18), fontFamily: 'Lexend_400Regular' }}>Change:</Text>
                         <Text style={{ color: '#06BC2E', fontSize: s(24), fontFamily: 'Lexend_700Bold' }}>₱ {changeAmount < 0 ? '0.00' : changeAmount.toFixed(2)}</Text>
                      </View>
                   )}
                </View>
                
                <TouchableOpacity 
                  style={[styles.buttonPrimaryFull, { paddingVertical: s(15) }, (cart.length === 0 || !orderMode || isProcessingTx) && { opacity: 0.3 }]} 
                  onPress={handleProcessPayment}
                  disabled={cart.length === 0 || !orderMode || isProcessingTx}
                >
                  {isProcessingTx ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={[styles.buttonTextBold, { fontSize: s(24) }]}>Confirm Transaction</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}
      </View>

      {/* --- CUSTOMIZATION MODAL --- */}
      <Modal animationType="fade" transparent visible={modalVisible}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <TouchableOpacity style={styles.modalGoBack} onPress={() => setModalVisible(false)}>
                <Text style={styles.modalGoBackText}>Go Back</Text>
              </TouchableOpacity>
              <View style={styles.modalHeaderTitleGroup}>
                <Text style={styles.modalTitle}>Select Size and Add-Ons</Text>
                <Text style={styles.modalSubtitle}>{activeItem?.name}</Text>
              </View>
              <View style={{ width: s(100) }} />
            </View>

            <View style={styles.modalBody}>
              <ScrollView showsVerticalScrollIndicator={false} bounces={false} style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: s(20) }}>
                
                <View style={styles.customRow}>
                  {/* SIZE SELECTIONS */}
                  <View style={styles.sizeRow}>
                    <Text style={styles.modalLabel}>Size:</Text>
                    {activeItem && getAvailableSizes(activeItem).map((size) => (
                      <TouchableOpacity 
                        key={size}
                        style={[
                          styles.sizeBtn, 
                          selectedSize === size && styles.sizeBtnActive
                        ]} 
                        onPress={() => {
                          setSelectedSize(size);
                          setSelectedAddons({});
                        }}
                      >
                        <Text style={[styles.sizeBtnText, selectedSize === size && styles.textWhite]}>{size}</Text>
                        <Text style={[styles.sizeBtnText, { fontSize: s(17) }, selectedSize === size && styles.textWhite]}>
                          ₱{getProductPrice(activeItem, size)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  
                  {/* QUANTITY - USING NOWRAP */}
                  <View style={styles.qtyRow}>
                    <Text style={styles.modalLabel}>Qty:</Text>
                    <TouchableOpacity style={styles.qtyBtn} onPress={decrement}><Ionicons name="remove-outline" size={s(24)} color={currentColors.buttonBg} /></TouchableOpacity>
                    <View style={styles.qtyDisplay}><Text style={styles.qtyText}>{quantity}</Text></View>
                    <TouchableOpacity style={styles.qtyBtn} onPress={increment}><Ionicons name="add-outline" size={s(24)} color={currentColors.buttonBg} /></TouchableOpacity>
                  </View>
                </View>

                {/* PROMO HINT */}
                {(() => {
                  // FIX: Find matching promo for both item and category promo types
                  const activePromo = promotions.find(p => {
                    if (p.promoType === 'category') {
                      return p.categoryName === activeItem?.category &&
                        (!p.variantName || p.variantName === selectedSize);
                    }
                    return p.menuItemName === activeItem?.name &&
                      (!p.variantName || p.variantName === selectedSize);
                  });
                  if (!activePromo) return null;
                  const willApply = quantity >= activePromo.triggerQty;
                  return (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8), backgroundColor: willApply ? '#E6F9EC' : '#FFF8E1', borderRadius: s(8), padding: s(10), marginBottom: s(6) }}>
                      <Ionicons name="pricetag-outline" size={s(18)} color={willApply ? '#06BC2E' : '#C47D00'} />
                      <Text style={{ flex: 1, color: willApply ? '#06BC2E' : '#9A6700', fontSize: s(15), fontFamily: 'Lexend_400Regular' }}>
                        {willApply
                          ? `Promo applied! ${activePromo.triggerQty} for ₱${activePromo.bundlePrice}`
                          : `Buy ${activePromo.triggerQty} to get them for ₱${activePromo.bundlePrice}`}
                      </Text>
                    </View>
                  );
                })()}

                {/* SUGAR LEVEL */}
                {activeItem?.hasSugar && (
                  <View style={{ marginBottom: s(24) }}>
                    <Text style={styles.modalLabel}>Sugar Level:</Text>
                    <View style={{ flexDirection: 'row', gap: s(10), marginTop: s(10) }}>
                      {[0, 25, 50, 75, 100].map((level) => (
                        <TouchableOpacity
                          key={level}
                          style={[
                            styles.sizeBtn,
                            selectedSugarLevel === level && styles.sizeBtnActive,
                            { flex: 1, minWidth: 0 },
                          ]}
                          onPress={() => setSelectedSugarLevel(level)}
                        >
                          <Text style={[styles.sizeBtnText, selectedSugarLevel === level && styles.textWhite]}>
                            {level}%
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}

                {/* ADD-ONS */}
                {(() => {
                  const addons = activeItem?.addOns || [];
                  if (!addons || addons.length === 0) return null;
                  const rows = [];
                  for (let i = 0; i < addons.length; i += 2) {
                    const rowItems = [];
                    for (let j = 0; j < 2; j++) {
                      const addon = addons[i + j];
                      if (addon) {
                        const isSelected = !!selectedAddons[addon.name];
                        const qty = selectedAddons[addon.name] || 0;
                        rowItems.push(
                          <TouchableOpacity
                            key={addon.name}
                            style={[styles.addonItem, isSelected && styles.addonItemActive]}
                            onPress={() => !isSelected && toggleAddon(addon.name)}
                            activeOpacity={isSelected ? 1 : 0.7}
                          >
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.addonText, isSelected && styles.textWhite]}>{addon.name}</Text>
                              <Text style={[styles.addonPrice, isSelected && styles.textOffWhite]}>
                                +₱{addon.price}{isSelected && qty > 1 ? ` × ${qty}` : ''}
                              </Text>
                            </View>
                            {isSelected ? (
                              <View style={styles.addonQtyRow}>
                                <TouchableOpacity
                                  style={styles.addonQtyBtn}
                                  onPress={() => decrementAddon(addon.name)}
                                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                >
                                  <Ionicons name={qty === 1 ? 'close' : 'remove'} size={s(17)} color="#FFFFFF" />
                                </TouchableOpacity>
                                <Text style={styles.addonQtyText}>{qty}</Text>
                                <TouchableOpacity
                                  style={[styles.addonQtyBtn, qty >= 4 && { opacity: 0.35 }]}
                                  onPress={() => incrementAddon(addon.name)}
                                  disabled={qty >= 4}
                                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                >
                                  <Ionicons name="add" size={s(17)} color="#FFFFFF" />
                                </TouchableOpacity>
                              </View>
                            ) : (
                              <View style={styles.checkbox} />
                            )}
                          </TouchableOpacity>
                        );
                      } else {
                        rowItems.push(
                          <View key={`empty-${i}-${j}`} style={[styles.addonItem, { backgroundColor: 'transparent', borderColor: 'transparent' }]} pointerEvents="none" />
                        );
                      }
                    }
                    rows.push(<View key={i} style={styles.addonRow}>{rowItems}</View>);
                  }
                  return (
                    <>
                      <Text style={styles.modalLabel}>Add-Ons</Text>
                      <View style={styles.addonsGrid}>{rows}</View>
                    </>
                  );
                })()}
              </ScrollView>

              <View style={styles.modalFooter}>
                {editingId ? (
                  <View style={styles.buttonGroupRow}>
                    <TouchableOpacity style={styles.halfRemoveBtn} onPress={handleRemove}><Text style={styles.buttonTextBold}>Remove</Text></TouchableOpacity>
                    <TouchableOpacity style={styles.buttonPrimaryHalf} onPress={handleConfirmOrder}><Text style={styles.buttonTextBold}>Update</Text></TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.buttonPrimaryFull} onPress={handleConfirmOrder}><Text style={styles.buttonTextBold}>Confirm</Text></TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* --- CONFIRM TRANSACTION MODAL (Cash / Bank) --- */}
      <Modal animationType="fade" transparent visible={confirmTransactionVisible && paymentMethod !== 'E-Wallet'}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainerSmall}>
            <Text style={styles.modalTitleLarge}>Transaction Complete?</Text>
            
            <Text style={styles.confirmSubtitle}>
              {paymentMethod === 'Bank'
                ? `Please ensure the ${selectedProvider} payment has been successfully verified.`
                : 'Has the cash payment been received and change given?'}
            </Text>

            <View style={styles.buttonGroupRow}>
              <TouchableOpacity 
                style={styles.buttonOutlineHalf} 
                onPress={() => setConfirmTransactionVisible(false)}
                disabled={isProcessingTx}
              >
                <Text style={styles.buttonOutlineTextBold}>Return</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.buttonPrimaryHalf} onPress={handleConfirmComplete} disabled={isProcessingTx}>
                {isProcessingTx ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.buttonTextBold}>Confirm</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* --- E-WALLET QR MODAL --- */}
      <Modal animationType="fade" transparent visible={confirmTransactionVisible && paymentMethod === 'E-Wallet'}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainerSmall}>

            {selectedProvider === 'GCash' && (
              gcash.status === 'creating' ? (
                <View style={{ alignItems: 'center', marginVertical: s(40) }}>
                  <ActivityIndicator size="large" color={currentColors.buttonBg} />
                  <Text style={{ fontSize: s(22), fontFamily: 'Lexend_400Regular', color: currentColors.textSub, marginTop: s(16) }}>
                    Preparing GCash payment...
                  </Text>
                </View>
              ) : gcash.status === 'pending' || gcash.status === 'paid' ? (
                <View style={{ alignItems: 'center', marginVertical: s(20) }}>
                  <View style={{ backgroundColor: '#FFFFFF', padding: s(16), borderRadius: s(12) }}>
                    <QRCode value={gcash.checkoutUrl} size={s(260)} />
                  </View>
                  <Text style={{ fontSize: s(22), fontFamily: 'Lexend_400Regular', color: currentColors.textSub, marginTop: s(16), textAlign: 'center' }}>
                    {gcash.status === 'paid' ? 'Payment received!' : `Scan with GCash to pay ₱${grandTotal.toFixed(2)}`}
                  </Text>
                  {gcash.status === 'pending' && (
                    <Text style={{ fontSize: s(18), fontFamily: 'Lexend_400Regular', color: currentColors.textSub, marginTop: s(6) }}>
                      Waiting for payment... this completes automatically.
                    </Text>
                  )}
                  {GCASH_SIMULATED && gcash.status === 'pending' && (
                    <View style={{ alignItems: 'center', marginTop: s(14) }}>
                      <Text style={{ fontSize: s(16), fontFamily: 'Lexend_700Bold', color: '#F57C00' }}>SIMULATION MODE - no real payment</Text>
                      <TouchableOpacity
                        onPress={() => simulateGcashPaid(gcash.paymentId)}
                        style={{ marginTop: s(8), paddingVertical: s(10), paddingHorizontal: s(20), borderRadius: s(10), backgroundColor: '#0070E0' }}
                      >
                        <Text style={{ fontSize: s(20), fontFamily: 'Lexend_700Bold', color: '#FFFFFF' }}>Simulate customer paid</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ) : (
                <>
                  {gcash.status === 'error' && (
                    <View style={{ alignItems: 'center', marginTop: s(10) }}>
                      <Text style={{ fontSize: s(20), fontFamily: 'Lexend_400Regular', color: '#D32F2F', textAlign: 'center' }}>
                        GCash gateway unavailable. Use the store QR and confirm manually, or retry.
                      </Text>
                      <TouchableOpacity onPress={() => setGcashAttempt((n) => n + 1)} style={{ marginTop: s(10), padding: s(8) }}>
                        <Text style={{ fontSize: s(20), fontFamily: 'Lexend_700Bold', color: currentColors.buttonBg }}>Retry</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  {dynamicQRs.gcash ? (
                    <Image source={{ uri: dynamicQRs.gcash }} style={styles.qrCodeImage} />
                  ) : (
                    <Text style={{ fontSize: s(22), fontFamily: 'Lexend_400Regular', color: currentColors.textSub, textAlign: 'center', marginVertical: s(40) }}>
                      No GCash QR uploaded yet.
                    </Text>
                  )}
                </>
              )
            )}
            
            {selectedProvider === 'Maya' && (
              dynamicQRs.maya ? (
                <Image source={{ uri: dynamicQRs.maya }} style={styles.qrCodeImage} />
              ) : (
                <Text style={{ fontSize: s(22), fontFamily: 'Lexend_400Regular', color: currentColors.textSub, textAlign: 'center', marginVertical: s(40) }}>
                  No Maya QR uploaded yet.
                </Text>
              )
            )}

            <View style={styles.buttonGroupRow}>
              <TouchableOpacity 
                style={styles.buttonOutlineHalf} 
                onPress={() => setConfirmTransactionVisible(false)}
                disabled={isProcessingTx}
              >
                <Text style={styles.buttonOutlineTextBold}>Return</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.buttonPrimaryHalf, gcashLocked && { opacity: 0.4 }]}
                onPress={handleConfirmComplete}
                disabled={isProcessingTx || gcashLocked}
              >
                {isProcessingTx ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.buttonTextBold}>Confirm</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL: RECEIPT BUILDER */}
      <Modal animationType="fade" transparent visible={finalReceiptVisible}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainerReceipt}>
            <Text style={styles.receiptTitle}>Transaction Complete!</Text>
            
            <Text style={styles.receiptDescription}>
              This transaction details have been saved and is assigned as 
              <Text style={styles.bold}> {savedTxNumber}.</Text>
            </Text>
            
            {transactionTime && (
              <Text style={styles.receiptDateText}>
                Recorded at: {transactionTime}
              </Text>
            )}

            <View style={styles.buttonGroupRow}>
              <TouchableOpacity style={styles.buttonOutlineHalf} onPress={resetAll}>
                <Text style={styles.buttonOutlineTextBold}>New Order</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.buttonSecondaryHalf}
                onPress={() => {
                  printTransactionReceipt({
                    txNumber: savedTxNumber,
                    dateStr: transactionTime,
                    cashierName,
                    customerName: customerName.trim(),
                    customerType,
                    orderMode: orderMode === 'Delivery' ? `For Delivery - ${deliveryPartner}` : 'Take Out',
                    paymentMode: paymentMethod === 'Cash' ? 'Cash' : `${paymentMethod} - ${selectedProvider}`,
                    orders: cart.map(item => {
                      const promoEntry = cartItemPromos.find(p => p.cartItemId === item.id);
                      return { name: item.name, size: item.size, qty: item.qty, addons: item.addons, totalPrice: item.totalPrice, effectivePrice: promoEntry ? promoEntry.discountedTotal : item.totalPrice };
                    }),
                    subTotal,
                    discountAmount: parseFloat(discountAmount.toFixed(2)),
                    promoDiscountAmount: parseFloat(promoDiscount.toFixed(2)),
                    totalAmount: grandTotal,
                    ...(paymentMethod === 'Cash' && {
                      cashTendered: parseFloat(parseFloat(amountGiven).toFixed(2)),
                      changeGiven: parseFloat(changeAmount.toFixed(2)),
                    }),
                  });
                  resetAll();
                }}
              >
                <Text style={styles.buttonTextBold}>Print Receipt</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

// --- STYLES ---
const getStyles = (s, width, height, colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.containerBg, paddingHorizontal: width < 900 ? s(30) : s(80), paddingVertical: s(40) },
  bold: { fontFamily: 'Lexend_700Bold' },
  
  textWhite: { color: '#FFFFFF' },
  textOffWhite: { color: '#FFFFFF' },
  bgWhite: { backgroundColor: '#FFFFFF' },

  topToolbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: s(30), gap: s(10) },
  cancelButton: { backgroundColor: colors.cardBg, flexDirection: 'row', alignItems: 'center', paddingHorizontal: s(20), paddingVertical: s(15), borderRadius: s(15), gap: s(10), elevation: s(5), shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 3 },
  toolbarText: { color: colors.textMain, fontSize: s(30), fontFamily: 'Lexend_400Regular' },

  dateTimeContainer: { alignItems: 'flex-end', justifyContent: 'center' },
  dateTextTop: { color: 'rgba(255,255,255,0.7)', fontSize: s(20), fontFamily: 'Lexend_700Bold' },
  timeTextBottom: { color: '#FFFFFF', fontSize: s(36), fontFamily: 'Lexend_700Bold', marginTop: s(2) },
  
  mainGrid: { flex: 1, flexDirection: width < 800 ? 'column' : 'row', gap: s(30) },
  menuColumn: { flex: width < 800 ? 1 : 0.6, backgroundColor: colors.cardBg, borderRadius: s(20), overflow: 'hidden', elevation: s(5), shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 3 },
  orderColumn: { flex: width < 800 ? 1 : 0.4, backgroundColor: colors.cardBg, borderRadius: s(20), overflow: 'hidden', flexDirection: 'column', elevation: s(5), shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 3 },
  
  columnHeader: { paddingVertical: s(20), alignItems: 'center', backgroundColor: colors.headerBg },
  columnHeaderWithBack: { paddingVertical: s(20), paddingHorizontal: s(20), flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.headerBg },
  columnHeaderText: { color: '#FFFFFF', fontSize: s(28), fontFamily: 'Lexend_700Bold', textAlign: 'center' },
  
  goBackButton: { backgroundColor: colors.cardBg, paddingHorizontal: s(25), paddingVertical: s(15), borderRadius: s(12), borderWidth: s(2), borderColor: colors.buttonBg },
  goBackText: { color: colors.buttonBg, fontSize: s(24), fontFamily: 'Lexend_700Bold' },

  menuList: { padding: s(15) },
  menuItem: { backgroundColor: colors.background, flexDirection: 'row', alignItems: 'center', padding: s(18), borderRadius: s(12), marginBottom: s(12), gap: s(15), borderWidth: s(1.5), borderColor: colors.border },
  menuItemText: { color: colors.textMain, fontSize: s(28), fontFamily: 'Lexend_400Regular' },
  productItem: { backgroundColor: colors.background, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: s(25), paddingVertical: s(18), borderRadius: s(12), marginBottom: s(10), borderWidth: s(1.5), borderColor: colors.border },
  productItemText: { color: colors.textMain, fontSize: s(28), fontFamily: 'Lexend_700Bold' },
  productPriceText: { color: colors.textSub, fontSize: s(18), fontFamily: 'Lexend_400Regular', marginTop: s(4) },

  orderListContainer: { flex: 1, padding: s(15) },
  cartItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: s(14), paddingBottom: s(14), borderBottomWidth: s(1), borderBottomColor: colors.border },
  cartItemName: { color: colors.textMain, fontSize: s(18), fontFamily: 'Lexend_400Regular', flexWrap: 'wrap', maxWidth: '80%' },
  cartItemAddons: { color: colors.textSub, fontSize: s(13), fontFamily: 'Lexend_400Regular', marginTop: s(3), flexWrap: 'wrap' },
  cartItemPrice: { color: colors.buttonBg, fontSize: s(18), fontFamily: 'Lexend_700Bold' },
  orderFooter: { padding: s(20), alignItems: 'flex-end', gap: s(15), borderTopWidth: s(1), borderTopColor: colors.border, backgroundColor: colors.cardBg },
  totalText: { color: colors.textMain, fontSize: s(28), fontFamily: 'Lexend_700Bold' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  modalContainer: { width: width < 900 ? '90%' : '72%', minHeight: '50%', maxHeight: '88%', backgroundColor: colors.cardBg, borderRadius: s(30), overflow: 'hidden', flexDirection: 'column' },
  
  modalContainerSmall: { width: width < 600 ? '90%' : width < 900 ? '70%' : '42%', backgroundColor: colors.cardBg, borderRadius: s(30), padding: s(35), alignItems: 'center', gap: s(20), maxHeight: '95%' },
  modalContainerReceipt: { width: width < 900 ? '85%' : '65%', backgroundColor: colors.cardBg, borderRadius: s(30), padding: s(60), alignItems: 'center', gap: s(30) },
  
  modalHeader: { flexDirection: 'row', alignItems: 'center', padding: s(20), borderBottomWidth: s(1), borderBottomColor: colors.border },
  modalHeaderTitleGroup: { alignItems: 'center', flex: 1 },
  modalGoBack: { backgroundColor: colors.cardBg, paddingVertical: s(20), paddingHorizontal: s(35), borderRadius: s(10), borderWidth: s(2), borderColor: colors.buttonBg },
  modalGoBackText: { color: colors.buttonBg, fontSize: s(20), fontFamily: 'Lexend_700Bold' },
  modalTitle: { color: colors.textSub, fontSize: s(24), fontFamily: 'Lexend_400Regular' },
  modalSubtitle: { color: colors.buttonBg, fontSize: s(32), fontFamily: 'Lexend_700Bold' },
  modalBody: { flex: 1, padding: s(40), paddingBottom: 0, overflow: 'hidden' },

  methodToggleRow: { flexDirection: 'row', backgroundColor: colors.background, borderRadius: s(12), padding: s(5), borderWidth: s(1), borderColor: colors.border },
  methodToggleBtn: { flex: 1, backgroundColor: colors.background, paddingVertical: s(15), alignItems: 'center', borderRadius: s(10) },
  methodToggleBtnActive: { backgroundColor: colors.buttonBg },
  methodToggleText: { color: colors.textMain, fontSize: s(22), fontFamily: 'Lexend_700Bold' },
  methodToggleTextActive: { color: '#FFFFFF' },

  paymentLabel: { color: colors.textMain, fontSize: s(24), fontFamily: 'Lexend_400Regular' },
  checkoutInput: { backgroundColor: colors.background, color: colors.textMain, borderRadius: s(12), padding: s(15), fontSize: s(22), fontFamily: 'Lexend_400Regular', borderWidth: s(2), borderColor: colors.border },
  inputError: { borderColor: '#DF0C0C', backgroundColor: '#FFB2B2' },
  errorTextSmall: { color: '#DF0C0C', fontSize: s(18), fontFamily: 'Lexend_400Regular', marginTop: s(8) },

  eWalletRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: s(10), gap: s(15) },
  eWalletButton: { flex: 1, backgroundColor: colors.background, borderRadius: s(12), padding: s(15), alignItems: 'center', justifyContent: 'center', borderWidth: s(2), borderColor: colors.border, height: s(120), flexDirection: 'column' },
  eWalletSelected: { borderColor: colors.buttonBg, backgroundColor: colors.buttonBg },
  eWalletLogo: { flex: 1, width: '100%', resizeMode: 'contain', marginBottom: s(5) },
  eWalletLabel: { color: colors.textMain, fontSize: s(18), fontFamily: 'Lexend_700Bold' },
  eWalletLabelSelected: { color: '#FFFFFF' },

  modalTitleLarge: { color: colors.textMain, fontSize: s(50), fontFamily: 'Lexend_400Regular', textAlign: 'center', marginBottom: s(10) },
  confirmSubtitle: { color: colors.buttonBg, fontSize: s(22), fontFamily: 'Lexend_400Regular', textAlign: 'center', marginTop: s(5), marginBottom: s(10), lineHeight: s(35) },
  
  qrCodeImage: { width: Math.min(width * 0.75, height * 0.58, s(500)), height: Math.min(width * 0.75, height * 0.58, s(500)), resizeMode: 'contain', marginVertical: s(5) },
  separatorLine: { width: '100%', height: s(2), backgroundColor: colors.border, marginBottom: s(5) },

  receiptTitle: { color: colors.textMain, fontSize: s(70), fontFamily: 'Lexend_700Bold', textAlign: 'center' },
  receiptDescription: { color: colors.textSub, fontSize: s(30), fontFamily: 'Lexend_400Regular', textAlign: 'center', lineHeight: s(45) },
  receiptDateText: { color: colors.buttonBg, fontSize: s(22), fontFamily: 'Lexend_400Regular', marginTop: s(15), textAlign: 'center' },

  customRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: s(20), flexWrap: 'wrap', gap: s(30) },
  sizeRow: { flexDirection: 'row', alignItems: 'center', gap: s(10), flexWrap: 'wrap', flex: 1, minWidth: s(200) },
  modalLabel: { color: colors.textMain, fontSize: s(26), fontFamily: 'Lexend_400Regular' },
  
  sizeBtn: { backgroundColor: colors.background, paddingVertical: s(10), paddingHorizontal: s(12), borderRadius: s(8), minWidth: s(65), alignItems: 'center', borderWidth: s(1), borderColor: colors.border },
  sizeBtnActive: { backgroundColor: colors.buttonBg, borderColor: colors.buttonBg },
  sizeBtnText: { color: colors.textMain, fontSize: s(21), fontFamily: 'Lexend_700Bold' },
  
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: s(10), flexWrap: 'nowrap' }, 
  qtyBtn: { backgroundColor: colors.background, padding: s(8), borderRadius: s(8), borderWidth: s(1), borderColor: colors.border },
  qtyDisplay: { backgroundColor: colors.background, paddingHorizontal: s(20), paddingVertical: s(8), borderRadius: s(8), borderWidth: s(1), borderColor: colors.border },
  qtyText: { color: colors.textMain, fontSize: s(24), fontFamily: 'Lexend_700Bold' },

  addonsGrid: { flexDirection: 'column', gap: s(12), marginTop: s(20), marginBottom: s(20) },
  addonRow: { flexDirection: 'row', gap: s(12) },
  addonItem: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.background, borderRadius: s(10), paddingHorizontal: s(18), paddingVertical: s(14), minHeight: s(60), borderWidth: s(1), borderColor: colors.border },
  addonItemActive: { backgroundColor: colors.buttonBg, borderColor: colors.buttonBg },
  addonText: { color: colors.textMain, fontSize: s(25), fontFamily: 'Lexend_400Regular', flexShrink: 1 },
  addonPrice: { color: colors.textSub, fontSize: s(18), fontFamily: 'Lexend_400Regular', marginTop: s(4) },

  addonQtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderRadius: s(8),
    paddingHorizontal: s(4),
    paddingVertical: s(4),
    gap: s(6),
    marginLeft: s(8),
  },
  addonQtyBtn: {
    width: s(28),
    height: s(28),
    borderRadius: s(6),
    backgroundColor: 'rgba(255,255,255,0.22)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addonQtyText: {
    color: '#FFFFFF',
    fontSize: s(20),
    fontFamily: 'Lexend_700Bold',
    minWidth: s(22),
    textAlign: 'center',
  },

  checkbox: { width: s(30), height: s(30), backgroundColor: colors.cardBg, borderRadius: s(8), marginLeft: s(10), flexShrink: 0, borderWidth: s(2), borderColor: colors.border, justifyContent: 'center', alignItems: 'center' },
  checkboxActive: { backgroundColor: 'transparent', borderColor: 'transparent' },

  buttonPrimaryFull: { backgroundColor: colors.buttonBg, paddingHorizontal: s(40), paddingVertical: s(15), borderRadius: s(15), alignItems: 'center', width: '100%' },
  buttonPrimaryHalf: { backgroundColor: colors.buttonBg, paddingVertical: s(25), borderRadius: s(15), alignItems: 'center', flex: 1 },
  buttonSecondaryHalf: { backgroundColor: colors.headerBg, paddingVertical: s(25), borderRadius: s(15), alignItems: 'center', flex: 1 },
  
  buttonOutlineHalf: { backgroundColor: colors.cardBg, paddingVertical: s(23), borderRadius: s(15), alignItems: 'center', flex: 1, borderWidth: s(2), borderColor: colors.buttonBg, justifyContent: 'center' },
  buttonOutlineTextBold: { color: colors.buttonBg, fontSize: s(30), fontFamily: 'Lexend_700Bold', textAlign: 'center' },
  
  buttonTextBold: { color: '#FFFFFF', fontSize: s(30), fontFamily: 'Lexend_700Bold', textAlign: 'center' },
  buttonGroupRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', gap: s(30), marginTop: s(20) },
  halfRemoveBtn: { backgroundColor: '#A34A3B', paddingVertical: s(20), borderRadius: s(15), alignItems: 'center', width: '48%' },
  halfUpdateBtn: { backgroundColor: colors.buttonBg, paddingVertical: s(20), borderRadius: s(15), alignItems: 'center', width: '48%' },

  modalFooter: { paddingTop: s(20), paddingBottom: s(30), paddingHorizontal: 0, borderTopWidth: s(1), borderTopColor: colors.border },
});