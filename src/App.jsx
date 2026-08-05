import React, { useState, useEffect } from 'react';
import LoginRegister from './components/LoginRegister';
import EmployerPanel from './components/EmployerPanel';
import BankerPanel from './components/BankerPanel';
import InvoiceToast from './components/InvoiceToast';
import { fetchCardsForUser, fetchTransactionsForCards, createTransactionInDB, updateCardBalanceInDB, createInvoiceInDB, fetchInvoicesForUser, updateInvoiceStatusInDB } from './utils/simulation';
import { searchPassportInOfflineRegistry } from './utils/googleSheets';
import { LogOut, RefreshCw, Send, FileText, Landmark, User, CreditCard, ChevronRight, Eye, EyeOff, Search, Info, Check, ShieldCheck, HelpCircle } from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [cards, setCards] = useState([]);
  const [activeCardIndex, setActiveCardIndex] = useState(0);
  const [transactions, setTransactions] = useState([]);
  const [invoices, setInvoices] = useState([]);

  // App UI Views
  const [activeTab, setActiveTab] = useState('main'); // 'main', 'employer', 'banker'
  const [showCardNumber, setShowCardNumber] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Modals / forms
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showPassportDetailsModal, setShowPassportDetailsModal] = useState(false);
  const [showWarningModal, setShowWarningModal] = useState(false);

  // Transfer Form inputs
  const [transferTarget, setTransferTarget] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferComment, setTransferComment] = useState('');
  const [transferError, setTransferError] = useState('');

  // Invoice Form inputs
  const [invoiceTarget, setInvoiceTarget] = useState('');
  const [invoiceAmount, setInvoiceAmount] = useState('');
  const [invoiceComment, setInvoiceComment] = useState('');
  const [isForcedInvoice, setIsForcedInvoice] = useState(false);
  const [invoiceError, setInvoiceError] = useState('');

  // Admin activation input
  const [adminCode, setAdminCode] = useState('');
  const [isAdminActivated, setIsAdminActivated] = useState(false);

  // Active/Incoming Invoice toast
  const [currentInvoiceToast, setCurrentInvoiceToast] = useState(null);

  // Status message for forms
  const [msg, setMsg] = useState({ type: '', text: '' });

  useEffect(() => {
    // Check if there is an active session
    const savedUser = sessionStorage.getItem('mono_user');
    if (savedUser) {
      const parsedUser = JSON.parse(savedUser);
      setCurrentUser(parsedUser);
      refreshData(parsedUser.passport_code);
    }
  }, []);

  // Poll for invoices every 5 seconds to simulate push notifications!
  useEffect(() => {
    if (!currentUser) return;
    const interval = setInterval(() => {
      checkForIncomingInvoices();
    }, 5000);
    return () => clearInterval(interval);
  }, [currentUser, invoices]);

  const refreshData = async (passportCode) => {
    setRefreshing(true);
    const userCards = await fetchCardsForUser(passportCode || currentUser.passport_code);
    setCards(userCards);

    if (userCards.length > 0) {
      const cardNums = userCards.map(c => c.card_number);
      const txs = await fetchTransactionsForCards(cardNums);
      setTransactions(txs);
    }

    // Check invoices
    const userInvoices = await fetchInvoicesForUser(passportCode || currentUser.passport_code);
    setInvoices(userInvoices);
    setRefreshing(false);
  };

  const checkForIncomingInvoices = async () => {
    if (!currentUser) return;
    const userInvoices = await fetchInvoicesForUser(currentUser.passport_code);
    setInvoices(userInvoices);

    // Find first pending invoice
    const pending = userInvoices.find(i => i.status === 'pending');
    if (pending && (!currentInvoiceToast || currentInvoiceToast.id !== pending.id)) {
      // Find sender name from local register
      const sender = searchPassportInOfflineRegistry(pending.sender_passport);
      setCurrentInvoiceToast({
        ...pending,
        senderName: sender.success ? `${sender.firstName} ${sender.lastName}` : "Неизвестная компания"
      });

      // Handle direct charge (Forced Invoice)
      if (pending.is_forced) {
        handleAcceptInvoice(pending);
      }
    }
  };

  const handleLoginSuccess = (user, userCards) => {
    sessionStorage.setItem('mono_user', JSON.stringify(user));
    setCurrentUser(user);
    setCards(userCards);
    refreshData(user.passport_code);
  };

  const handleLogout = () => {
    sessionStorage.clear();
    setCurrentUser(null);
    setCards([]);
    setActiveCardIndex(0);
    setTransactions([]);
    setActiveTab('main');
    setIsAdminActivated(false);
  };

  const handleCardCreated = () => {
    refreshData(currentUser.passport_code);
  };

  const activeCard = cards[activeCardIndex] || null;

  // Handle funds transfer
  const handleTransferSubmit = async (e) => {
    e.preventDefault();
    setTransferError('');
    if (!activeCard) return;

    if (Number(transferAmount) <= 0) {
      setTransferError('Сумма должна быть больше 0');
      return;
    }

    if (Number(activeCard.balance) < Number(transferAmount)) {
      setTransferError('Недостаточно средств на выбранной карте');
      return;
    }

    try {
      // Find receiver's card. It can be card number or passport code.
      const cleanTarget = transferTarget.trim().replace(/\s+/g, '');
      const localData = localStorage.getItem("monobank_irnovia_sim_db");
      let receiverCard = null;
      let receiverPassport = null;

      if (localData) {
        const db = JSON.parse(localData);
        // Try matching as card number first
        receiverCard = db.cards.find(c => c.card_number.replace(/\s+/g, '') === cleanTarget);

        // Try matching as passport
        if (!receiverCard) {
          const userObj = db.users.find(u => u.passport_code === transferTarget);
          if (userObj) {
            receiverCard = db.cards.find(c => c.passport_code === userObj.passport_code && c.card_type === 'personal');
          }
        }
      }

      if (!receiverCard) {
        setTransferError('Получатель не зарегистрирован в системе банка');
        return;
      }

      if (receiverCard.card_number === activeCard.card_number) {
        setTransferError('Нельзя перевести деньги самому себе на ту же карту');
        return;
      }

      // Update balances
      const senderNewBal = Number(activeCard.balance) - Number(transferAmount);
      const receiverNewBal = Number(receiverCard.balance) + Number(transferAmount);

      await updateCardBalanceInDB(activeCard.card_number, senderNewBal);
      await updateCardBalanceInDB(receiverCard.card_number, receiverNewBal);

      // Log transaction
      const tx = {
        id: Math.random().toString(36).substr(2, 9),
        sender_card: activeCard.card_number,
        receiver_card: receiverCard.card_number,
        amount: Number(transferAmount),
        description: transferComment || `Перевод средств`,
        transaction_type: 'transfer',
        created_at: new Date().toISOString()
      };

      await createTransactionInDB(tx);

      // Close modal & reset inputs
      setShowTransferModal(false);
      setTransferTarget('');
      setTransferAmount('');
      setTransferComment('');

      refreshData(currentUser.passport_code);
    } catch (err) {
      setTransferError('Ошибка при проведении платежа');
    }
  };

  // Handle Invoice Issuing
  const handleInvoiceSubmit = async (e) => {
    e.preventDefault();
    setInvoiceError('');

    if (Number(invoiceAmount) <= 0) {
      setInvoiceError('Сумма должна быть больше 0');
      return;
    }

    try {
      const cleanTarget = invoiceTarget.trim();
      const localData = localStorage.getItem("monobank_irnovia_sim_db");
      let receiverUser = null;

      if (localData) {
        const db = JSON.parse(localData);
        // Try finding user by passport or card number
        receiverUser = db.users.find(u => u.passport_code === cleanTarget);
        if (!receiverUser) {
          const matchedCard = db.cards.find(c => c.card_number.replace(/\s+/g, '') === cleanTarget.replace(/\s+/g, ''));
          if (matchedCard) {
            receiverUser = db.users.find(u => u.passport_code === matchedCard.passport_code);
          }
        }
      }

      if (!receiverUser) {
        setInvoiceError('Получатель счета не найден в системе банка');
        return;
      }

      if (receiverUser.passport_code === currentUser.passport_code) {
        setInvoiceError('Нельзя выставить счет самому себе');
        return;
      }

      const invoice = {
        id: Math.random().toString(36).substr(2, 9),
        sender_passport: currentUser.passport_code,
        receiver_passport: receiverUser.passport_code,
        amount: Number(invoiceAmount),
        description: invoiceComment || 'Оплата товаров / услуг',
        status: 'pending',
        is_forced: isForcedInvoice && currentUser.is_employer_approved, // Only approved employers can send forced invoices!
        created_at: new Date().toISOString()
      };

      await createInvoiceInDB(invoice);
      setShowInvoiceModal(false);
      setInvoiceTarget('');
      setInvoiceAmount('');
      setInvoiceComment('');
      setIsForcedInvoice(false);

      setMsg({ type: 'success', text: `Счет для ${receiverUser.first_name} ${receiverUser.last_name} успешно выставлен!` });
      setTimeout(() => setMsg({ type: '', text: '' }), 4000);
    } catch (err) {
      setInvoiceError('Ошибка выставления счета');
    }
  };

  const handleAcceptInvoice = async (inv) => {
    if (!activeCard) return;

    if (Number(activeCard.balance) < Number(inv.amount)) {
      setMsg({ type: 'error', text: 'Ошибка авто-оплаты счета: недостаточно средств на карте' });
      setCurrentInvoiceToast(null);
      return;
    }

    try {
      // Find sender's card to add money
      const localData = localStorage.getItem("monobank_irnovia_sim_db");
      let senderCard = null;

      if (localData) {
        const db = JSON.parse(localData);
        senderCard = db.cards.find(c => c.passport_code === inv.sender_passport && c.card_type === 'personal');
        if (!senderCard) {
          senderCard = db.cards.find(c => c.passport_code === inv.sender_passport);
        }
      }

      if (!senderCard) return;

      const senderNewBal = Number(senderCard.balance) + Number(inv.amount);
      const receiverNewBal = Number(activeCard.balance) - Number(inv.amount);

      await updateCardBalanceInDB(senderCard.card_number, senderNewBal);
      await updateCardBalanceInDB(activeCard.card_number, receiverNewBal);

      await updateInvoiceStatusInDB(inv.id, 'paid');

      // Create transaction log
      const tx = {
        id: Math.random().toString(36).substr(2, 9),
        sender_card: activeCard.card_number,
        receiver_card: senderCard.card_number,
        amount: Number(inv.amount),
        description: inv.description ? `Оплата счета: ${inv.description}` : 'Оплата счета',
        transaction_type: inv.is_forced ? 'direct_charge' : 'invoice_payment',
        created_at: new Date().toISOString()
      };

      await createTransactionInDB(tx);
      setCurrentInvoiceToast(null);
      setMsg({ type: 'success', text: 'Счет успешно оплачен!' });
      refreshData(currentUser.passport_code);
    } catch (err) {}
  };

  const handleDeclineInvoice = async (inv) => {
    try {
      await updateInvoiceStatusInDB(inv.id, 'declined');
      setCurrentInvoiceToast(null);
      setShowWarningModal(true);
      refreshData(currentUser.passport_code);
    } catch (err) {}
  };

  const handleActivateBankerMode = (e) => {
    e.preventDefault();
    if (adminCode === '199235') {
      setIsAdminActivated(true);
      setActiveTab('banker');
      setAdminCode('');
    } else {
      alert("Неверный код доступа сотрудника");
    }
  };

  const passportDetails = searchPassportInOfflineRegistry(currentUser?.passport_code || '');

  if (!currentUser) {
    return <LoginRegister onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="min-h-screen bg-black text-white relative pb-12 select-none">
      {/* Background Glows */}
      <div className="absolute top-0 right-1/4 w-96 h-96 bg-[#FF007F] rounded-full blur-[200px] opacity-[0.08] pointer-events-none"></div>
      <div className="absolute bottom-10 left-1/4 w-96 h-96 bg-[#7B00FF] rounded-full blur-[200px] opacity-[0.08] pointer-events-none"></div>

      {/* Invoice Push Toast */}
      {currentInvoiceToast && (
        <InvoiceToast
          invoice={currentInvoiceToast}
          onAccept={handleAcceptInvoice}
          onDecline={handleDeclineInvoice}
        />
      )}

      {/* Header */}
      <header className="sticky top-0 z-30 bg-black/80 backdrop-blur-md border-b border-white/5 py-4 px-6 flex justify-between items-center max-w-5xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-tr from-[#FF007F] to-[#7B00FF] rounded-xl flex items-center justify-center font-bold font-mono">
            {"}|{"}
          </div>
          <div>
            <h1 className="text-sm font-black tracking-widest uppercase">Нацбанк</h1>
            <span className="text-[10px] text-gray-400">Царство Ирновия</span>
          </div>
        </div>

        {/* User Badge / Profile */}
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex flex-col text-right">
            <span className="text-xs font-bold text-white">{currentUser.first_name} {currentUser.last_name}</span>
            <span className="text-[9px] text-[#39FF14] font-semibold">{currentUser.discord_tag || "Гражданин"}</span>
          </div>
          <button
            onClick={() => setShowPassportDetailsModal(true)}
            className="p-2.5 bg-white/5 border border-white/5 hover:border-[#FF007F]/20 rounded-xl transition-all"
            title="Посмотреть паспорт"
          >
            <User className="w-4 h-4 text-gray-400" />
          </button>
          <button
            onClick={handleLogout}
            className="p-2.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-xl transition-all"
            title="Выйти"
          >
            <LogOut className="w-4 h-4 text-red-400" />
          </button>
        </div>
      </header>

      {/* Main navigation */}
      <nav className="flex justify-center border-b border-white/5 bg-black max-w-5xl mx-auto px-6 py-2">
        <div className="flex gap-2 bg-white/5 p-1 rounded-xl w-full max-w-md text-xs font-bold text-gray-400">
          <button
            onClick={() => setActiveTab('main')}
            className={`flex-1 py-2 rounded-lg transition-all ${activeTab === 'main' ? 'bg-[#FF007F] text-white shadow-md' : 'hover:text-white'}`}
          >
            Главный экран
          </button>
          <button
            onClick={() => setActiveTab('employer')}
            className={`flex-1 py-2 rounded-lg transition-all ${activeTab === 'employer' ? 'bg-[#FF007F] text-white shadow-md' : 'hover:text-white'}`}
          >
            Работодатель
          </button>
          {isAdminActivated && (
            <button
              onClick={() => setActiveTab('banker')}
              className={`flex-1 py-2 rounded-lg transition-all ${activeTab === 'banker' ? 'bg-yellow-500 text-black shadow-md' : 'hover:text-white'}`}
            >
              Панель Банкира
            </button>
          )}
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-6 mt-6">
        {/* Status Alert message */}
        {msg.text && (
          <div className={`p-4 rounded-xl text-sm font-medium mb-6 ${msg.type === 'error' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-green-500/10 text-green-400 border border-green-500/20'}`}>
            {msg.text}
          </div>
        )}

        {/* TAB: MAIN BANK VIEW */}
        {activeTab === 'main' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Left Col: Dynamic Card, Slider and Balance */}
            <div className="lg:col-span-1 space-y-6">

              {/* Card Slider */}
              <div className="relative">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-xs font-extrabold text-gray-400 uppercase tracking-widest">Мои счета ({cards.length})</span>
                  <button onClick={() => refreshData()} className="p-1.5 hover:bg-white/5 rounded-lg transition-all">
                    <RefreshCw className={`w-3.5 h-3.5 text-gray-400 ${refreshing ? 'animate-spin text-[#FF007F]' : ''}`} />
                  </button>
                </div>

                {/* Flip Card */}
                {activeCard ? (
                  <div className="flip-card cursor-pointer group h-52 w-full">
                    <div className="flip-card-inner h-full w-full relative rounded-2xl shadow-xl border border-white/10 overflow-hidden">
                      {/* Front: Styled Card */}
                      <div className={`flip-card-front absolute inset-0 w-full h-full p-6 flex flex-col justify-between rounded-2xl ${activeCard.card_type === 'salary' ? 'mono-gradient-blue' : activeCard.card_type === 'pension' ? 'mono-gradient-green' : 'mono-gradient-pink'}`}>
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="text-[10px] font-extrabold uppercase tracking-widest text-white/70">{activeCard.card_title}</span>
                            <h2 className="text-lg font-black text-white leading-tight mt-1">Царство Ирновия</h2>
                          </div>
                          <span className="text-lg font-black text-white/40">{"}|{"}</span>
                        </div>

                        {/* Balance display */}
                        <div>
                          <span className="text-[10px] text-white/60 font-semibold uppercase tracking-wider">Баланс</span>
                          <div className="text-3xl font-black text-white flex items-baseline gap-1 mt-0.5">
                            {Number(activeCard.balance).toFixed(2)} <span className="text-white/60 text-lg font-bold">{"}|{"}</span>
                          </div>
                        </div>

                        {/* Card Info */}
                        <div className="flex justify-between items-end">
                          <span className="text-xs font-bold font-mono tracking-widest text-white/90">
                            {showCardNumber ? activeCard.card_number : `•••• •••• •••• ${activeCard.card_number.slice(-4)}`}
                          </span>
                          <div className="flex gap-2">
                            <button
                              onClick={(e) => { e.stopPropagation(); setShowCardNumber(!showCardNumber); }}
                              className="p-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-all"
                            >
                              {showCardNumber ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="h-52 bg-white/5 border border-white/5 rounded-2xl flex flex-col items-center justify-center p-6 text-center text-gray-500">
                    <CreditCard className="w-8 h-8 mb-2" />
                    <span>У вас еще нет открытых карт.</span>
                  </div>
                )}
              </div>

              {/* Slider Dots */}
              <div className="flex justify-center gap-1.5">
                {cards.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveCardIndex(i)}
                    className={`w-2 h-2 rounded-full transition-all ${activeCardIndex === i ? 'bg-[#FF007F] w-4' : 'bg-white/20'}`}
                  />
                ))}
              </div>

              {/* Balance Chart (Static replica of Нацбанк styled beautiful visualization) */}
              <div className="glass-card p-6 rounded-2xl border border-white/5">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Динамика баланса</span>
                  <span className="text-[10px] text-green-400 font-bold bg-green-500/10 px-2 py-0.5 rounded-full">+12.5%</span>
                </div>
                {/* Simulated Chart Bars */}
                <div className="flex items-end justify-between gap-2 h-20 pt-4">
                  {[20, 35, 25, 45, 60, 40, 75, 55, 90].map((h, i) => (
                    <div key={i} className="flex-1 bg-white/10 hover:bg-[#FF007F] rounded-t transition-all group relative cursor-pointer" style={{ height: `${h}%` }}>
                      <span className="absolute -top-6 left-1/2 -translate-x-1/2 bg-white text-black text-[8px] font-extrabold px-1 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-all z-10">{h * 5} {"}|{"}</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between text-[8px] text-gray-500 font-semibold uppercase mt-3 tracking-wider">
                  <span>Янв</span>
                  <span>Март</span>
                  <span>Май</span>
                  <span>Июль</span>
                  <span>Авг</span>
                </div>
              </div>
            </div>

            {/* Right Cols: Quick Actions & Transactions */}
            <div className="lg:col-span-2 space-y-6">

              {/* Quick Actions (Нацбанк style buttons) */}
              <div className="glass-card p-6 rounded-2xl border border-white/5">
                <span className="text-xs font-extrabold text-gray-400 uppercase tracking-widest block mb-4">Быстрые действия</span>

                <div className="grid grid-cols-4 gap-3">

                  {/* Action: Send money */}
                  <button
                    onClick={() => setShowTransferModal(true)}
                    className="flex flex-col items-center group"
                  >
                    <div className="w-12 h-12 rounded-full bg-white/5 border border-white/5 group-hover:bg-[#FF007F] group-hover:text-white text-white flex items-center justify-center transition-all shadow-md">
                      <Send className="w-5 h-5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                    </div>
                    <span className="text-[10px] text-gray-400 group-hover:text-white font-bold mt-2 text-center">Перевод</span>
                  </button>

                  {/* Action: Issue Invoice */}
                  <button
                    onClick={() => setShowInvoiceModal(true)}
                    className="flex flex-col items-center group"
                  >
                    <div className="w-12 h-12 rounded-full bg-white/5 border border-white/5 group-hover:bg-[#FF007F] group-hover:text-white text-white flex items-center justify-center transition-all shadow-md">
                      <FileText className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] text-gray-400 group-hover:text-white font-bold mt-2 text-center">Выставить счет</span>
                  </button>

                  {/* Action: Open Account */}
                  <button
                    onClick={() => {
                      // Automatically create an additional card for simulated banking
                      const generateCardNumber = () => {
                        let num = '4441';
                        for (let i = 0; i < 12; i++) {
                          num += Math.floor(Math.random() * 10).toString();
                        }
                        return num.replace(/(\d{4})/g, '$1 ').trim();
                      };
                      const cardNum = generateCardNumber();
                      const count = cards.length;
                      const newCard = {
                        card_number: cardNum,
                        passport_code: currentUser.passport_code,
                        card_type: 'personal',
                        card_title: `Личная карта ${count + 1}`,
                        balance: 0.00,
                        created_at: new Date().toISOString()
                      };
                      setCards([...cards, newCard]);
                      refreshData(currentUser.passport_code);
                      setMsg({ type: 'success', text: 'Успешно! Открыт новый расчетный счет.' });
                      setTimeout(() => setMsg({ type: '', text: '' }), 4000);
                    }}
                    className="flex flex-col items-center group"
                  >
                    <div className="w-12 h-12 rounded-full bg-white/5 border border-white/5 group-hover:bg-[#FF007F] group-hover:text-white text-white flex items-center justify-center transition-all shadow-md">
                      <CreditCard className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] text-gray-400 group-hover:text-white font-bold mt-2 text-center">Новый счет</span>
                  </button>

                  {/* Action: Admin Activator */}
                  <button
                    onClick={() => {
                      const code = prompt("Введите служебный код сотрудника Нацбанка:");
                      if (code === '199235') {
                        setIsAdminActivated(true);
                        setActiveTab('banker');
                        alert("Режим сотрудника Нацбанка активирован!");
                      } else if (code !== null) {
                        alert("Неверный служебный код.");
                      }
                    }}
                    className="flex flex-col items-center group"
                  >
                    <div className="w-12 h-12 rounded-full bg-white/5 border border-white/5 group-hover:bg-[#FFD700] group-hover:text-black text-white flex items-center justify-center transition-all shadow-md">
                      <Landmark className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] text-gray-400 group-hover:text-white font-bold mt-2 text-center">Банкир</span>
                  </button>

                </div>
              </div>

              {/* Transactions List */}
              <div className="glass-card rounded-2xl border border-white/5 overflow-hidden">
                <div className="p-4 border-b border-white/5 flex justify-between items-center">
                  <span className="text-xs font-extrabold text-gray-400 uppercase tracking-widest">История транзакций</span>
                  <span className="text-[10px] bg-white/5 px-2.5 py-1 rounded-full text-white font-semibold">Счет: {activeCard?.card_title}</span>
                </div>

                <div className="divide-y divide-white/5 max-h-80 overflow-y-auto">
                  {transactions.length === 0 ? (
                    <div className="p-12 text-center text-gray-500">
                      <RefreshCw className="w-6 h-6 mx-auto mb-2 opacity-30 animate-pulse" />
                      <span className="text-xs">История пуста. Проведите ваш первый платеж!</span>
                    </div>
                  ) : (
                    transactions.map(tx => {
                      const isIncoming = tx.receiver_card === activeCard?.card_number;
                      const hasDetails = tx.meta_info;

                      return (
                        <div key={tx.id} className="p-4 flex items-center justify-between hover:bg-white/[0.01] transition-all">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-black ${isIncoming ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                              {isIncoming ? '+' : '-'}
                            </div>
                            <div>
                              <h4 className="text-xs font-black text-white">{tx.description}</h4>
                              <p className="text-[9px] text-gray-500 mt-0.5">
                                {new Date(tx.created_at).toLocaleDateString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                              </p>
                              {hasDetails && (
                                <div className="mt-1 text-[8px] bg-white/5 text-gray-400 px-1.5 py-0.5 rounded inline-flex items-center gap-1 border border-white/5">
                                  <Info className="w-2.5 h-2.5" />
                                  <span>
                                    {tx.meta_info.branch ? `Отделение №${tx.meta_info.branch}` : `Заявление №${tx.meta_info.statement_number}`}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className={`text-sm font-black flex items-baseline gap-0.5 ${isIncoming ? 'text-green-400' : 'text-white'}`}>
                            {isIncoming ? '+' : '-'}{Number(tx.amount).toFixed(2)} <span className="text-[10px]">{"}|{"}</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

            </div>

          </div>
        )}

        {/* TAB: EMPLOYER CABINET */}
        {activeTab === 'employer' && (
          <EmployerPanel user={currentUser} onCardCreated={handleCardCreated} />
        )}

        {/* TAB: BANKER CABINET */}
        {activeTab === 'banker' && (
          <BankerPanel user={currentUser} onAdminAction={() => refreshData(currentUser.passport_code)} />
        )}
      </main>

      {/* FOOTER */}
      <footer className="mt-20 border-t border-white/5 pt-6 text-center text-gray-500 text-[10px] max-w-5xl mx-auto">
        <p>&copy; {new Date().getFullYear()} Национальный банк Ирновии. Разработано для Царства Ирновия.</p>
        <p className="mt-1">Для поддержки обратитесь к Царю Ирновии Артёму Артемлу.</p>
      </footer>

      {/* MODAL: TRANSFER MONEY */}
      {showTransferModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-md bg-[#1F2833] border border-white/10 rounded-3xl p-6 shadow-2xl relative">
            <h3 className="text-lg font-black text-white mb-4">Перевод на карту или паспорт</h3>

            {transferError && (
              <div className="p-3 bg-red-500/10 text-red-400 border border-red-500/20 text-xs rounded-xl mb-4">
                {transferError}
              </div>
            )}

            <form onSubmit={handleTransferSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5">Номер карты или Код паспорта получателя</label>
                <input
                  type="text"
                  value={transferTarget}
                  onChange={(e) => setTransferTarget(e.target.value)}
                  placeholder="4441... или C•01•191125•001"
                  required
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-xs font-semibold focus:outline-none focus:border-[#FF007F] uppercase"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5">Сумма (Жоронов {"}|{"})</label>
                <input
                  type="number"
                  value={transferAmount}
                  onChange={(e) => setTransferAmount(e.target.value)}
                  placeholder="0.00"
                  required
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-xs font-semibold focus:outline-none focus:border-[#FF007F]"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5">Комментарий получателю (необязательно)</label>
                <input
                  type="text"
                  value={transferComment}
                  onChange={(e) => setTransferComment(e.target.value)}
                  placeholder="Например: За пиццу"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-xs font-semibold focus:outline-none focus:border-[#FF007F]"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowTransferModal(false)}
                  className="flex-1 border border-white/10 hover:bg-white/5 py-3 rounded-xl font-bold text-xs"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="flex-[2] bg-gradient-to-r from-[#FF007F] to-[#7B00FF] py-3 rounded-xl font-bold text-xs shadow-lg shadow-[#FF007F]/10 flex items-center justify-center gap-1"
                >
                  <Send className="w-3.5 h-3.5" /> Отправить
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ISSUE INVOICE */}
      {showInvoiceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-md bg-[#1F2833] border border-white/10 rounded-3xl p-6 shadow-2xl relative">
            <h3 className="text-lg font-black text-white mb-4">Выставить счет гражданину</h3>

            {invoiceError && (
              <div className="p-3 bg-red-500/10 text-red-400 border border-red-500/20 text-xs rounded-xl mb-4">
                {invoiceError}
              </div>
            )}

            <form onSubmit={handleInvoiceSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5">Получатель (Код паспорта или карта)</label>
                <input
                  type="text"
                  value={invoiceTarget}
                  onChange={(e) => setInvoiceTarget(e.target.value)}
                  placeholder="Пример: C•01•191125•001"
                  required
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-xs font-semibold focus:outline-none focus:border-[#FF007F] uppercase"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5">Сумма счета (Жоронов {"}|{"})</label>
                <input
                  type="number"
                  value={invoiceAmount}
                  onChange={(e) => setInvoiceAmount(e.target.value)}
                  placeholder="0.00"
                  required
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-xs font-semibold focus:outline-none focus:border-[#FF007F]"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5">За что счет (Описание)</label>
                <input
                  type="text"
                  value={invoiceComment}
                  onChange={(e) => setInvoiceComment(e.target.value)}
                  placeholder="Например: Аренда помещения / Оплата за еду"
                  required
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-xs font-semibold focus:outline-none focus:border-[#FF007F]"
                />
              </div>

              {/* Forced Invoice toggle (only for approved employers) */}
              {currentUser.is_employer_approved && (
                <div className="flex items-center gap-2.5 bg-yellow-500/5 p-3 rounded-xl border border-yellow-500/10">
                  <input
                    type="checkbox"
                    id="forced-toggle"
                    checked={isForcedInvoice}
                    onChange={(e) => setIsForcedInvoice(e.target.checked)}
                    className="accent-[#FF007F]"
                  />
                  <label htmlFor="forced-toggle" className="text-[10px] text-yellow-400 font-bold leading-tight cursor-pointer">
                    Безусловный счет компании (списать без согласия клиента)
                  </label>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowInvoiceModal(false)}
                  className="flex-1 border border-white/10 hover:bg-white/5 py-3 rounded-xl font-bold text-xs"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="flex-[2] bg-[#FF007F] hover:bg-[#FF007F]/90 py-3 rounded-xl font-bold text-xs shadow-lg shadow-[#FF007F]/10 flex items-center justify-center gap-1 text-white"
                >
                  Выставить счет
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: PASSPORT DETAILS (PASSPORT STYLE INFO) */}
      {showPassportDetailsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-md bg-[#1F2833] border border-white/10 rounded-3xl p-6 shadow-2xl relative space-y-4">
            <h3 className="text-lg font-black text-white text-center">Государственный Паспорт Гражданина</h3>

            <div className="p-4 bg-black/30 border border-white/5 rounded-2xl text-xs space-y-3">
              <div className="flex justify-between border-b border-white/5 pb-2">
                <span className="text-gray-500">Имя:</span>
                <span className="text-white font-bold">{passportDetails.firstName}</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-2">
                <span className="text-gray-500">Фамилия:</span>
                <span className="text-white font-bold">{passportDetails.lastName}</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-2">
                <span className="text-gray-500">Код паспорта:</span>
                <span className="text-[#FF007F] font-bold font-mono">{passportDetails.passportCode}</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-2">
                <span className="text-gray-500">Пол:</span>
                <span className="text-white font-bold">{passportDetails.gender}</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-2">
                <span className="text-gray-500">Год рождения:</span>
                <span className="text-white font-bold">{passportDetails.birthYear}</span>
              </div>
              <div className="flex flex-col border-b border-white/5 pb-2">
                <span className="text-gray-500 mb-1">Трудовая книжка:</span>
                <span className="text-white bg-black/40 p-2.5 rounded-lg border border-white/5 font-mono text-[9px] leading-relaxed whitespace-pre-wrap">{passportDetails.workLog || "Трудовая книжка пуста"}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-gray-500 mb-1">Справка о судимостях:</span>
                <span className="text-white bg-black/40 p-2.5 rounded-lg border border-white/5 font-mono text-[9px] leading-relaxed whitespace-pre-wrap">{passportDetails.crimes || "Судимостей не обнаружено"}</span>
              </div>
            </div>

            <button
              onClick={() => setShowPassportDetailsModal(false)}
              className="w-full bg-white text-black font-extrabold py-3 rounded-xl text-xs"
            >
              Закрыть паспорт
            </button>
          </div>
        </div>
      )}

      {/* MODAL: WARNING MODAL (ON DECLINE INVOICE) */}
      {showWarningModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-sm bg-[#1F2833] border border-red-500/20 rounded-3xl p-6 shadow-2xl text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto border border-red-500/20">
              <User className="w-6 h-6 text-red-500" />
            </div>
            <h3 className="text-lg font-black text-white">Внимание! Вы отклонили счет</h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              Пользователь, выставивший вам этот счет, был успешно уведомлен о вашем отказе.
            </p>
            <p className="text-xs text-red-400 font-semibold bg-red-500/5 p-3 rounded-xl border border-red-500/10 leading-relaxed">
              Внимание: в случае того, что вы обманули и уклонились от законной оплаты за оказанную услугу или полученный товар, вы будете строго наказаны в соответствии с законами Царства Ирновия!
            </p>

            <button
              onClick={() => setShowWarningModal(false)}
              className="w-full bg-red-500 hover:bg-red-600 text-white font-extrabold py-3 rounded-xl text-xs uppercase"
            >
              Я понимаю риски
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
