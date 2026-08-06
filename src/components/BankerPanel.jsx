import React, { useState, useEffect } from 'react';
import { adminFetchAllUsers, fetchEmployerRequestsFromDB, updateEmployerRequestStatusInDB, createTransactionInDB, updateCardBalanceInDB } from '../utils/simulation';
import { Landmark, Users, Check, X, FileText, Landmark as BankIcon, DollarSign, Loader2, ArrowUpRight, Award } from 'lucide-react';

export default function BankerPanel({ user, onAdminAction }) {
  const [bankersCode, setBankersCode] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  
  const [users, setUsers] = useState([]);
  const [employerRequests, setEmployerRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('users'); // 'users', 'requests', 'withdraw', 'gov'

  // Form states
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedCard, setSelectedCard] = useState('');
  const [amount, setAmount] = useState('');
  const [branchNumber, setBranchNumber] = useState('');
  const [govPayoutTitle, setGovPayoutTitle] = useState('');
  const [govPayoutStatement, setGovPayoutStatement] = useState('');

  const [msg, setMsg] = useState({ type: '', text: '' });

  useEffect(() => {
    if (isAuthenticated) {
      loadAdminData();
    }
  }, [isAuthenticated]);

  const loadAdminData = async () => {
    setLoading(true);
    const allUsers = await adminFetchAllUsers();
    const reqs = await fetchEmployerRequestsFromDB();
    setUsers(allUsers);
    setEmployerRequests(reqs);
    setLoading(false);
  };

  const handleAuthenticate = (e) => {
    e.preventDefault();
    if (bankersCode === '199235') {
      setIsAuthenticated(true);
      setMsg({ type: 'success', text: 'Успешная авторизация в системе Нацбанка!' });
    } else {
      setMsg({ type: 'error', text: 'Неверный код доступа сотрудника банка' });
    }
  };

  const handleApproveEmployer = async (reqId) => {
    try {
      await updateEmployerRequestStatusInDB(reqId, 'approved');
      setMsg({ type: 'success', text: 'Компания успешно одобрена!' });
      loadAdminData();
      if (onAdminAction) onAdminAction();
    } catch (err) {
      setMsg({ type: 'error', text: 'Ошибка изменения статуса.' });
    }
  };

  const handleRejectEmployer = async (reqId) => {
    try {
      await updateEmployerRequestStatusInDB(reqId, 'rejected');
      setMsg({ type: 'success', text: 'Заявка отклонена' });
      loadAdminData();
    } catch (err) {
      setMsg({ type: 'error', text: 'Ошибка изменения статуса.' });
    }
  };

  const handleWithdrawCash = async (e) => {
    e.preventDefault();
    if (!selectedCard || !amount || Number(amount) <= 0 || !branchNumber) return;

    setLoading(true);
    setMsg({ type: '', text: '' });

    try {
      // Find card
      const targetUser = users.find(u => u.cards.some(c => c.card_number === selectedCard));
      const card = targetUser?.cards.find(c => c.card_number === selectedCard);

      if (!card) {
        setMsg({ type: 'error', text: 'Карта не найдена.' });
        setLoading(false);
        return;
      }

      if (Number(card.balance) < Number(amount)) {
        setMsg({ type: 'error', text: 'Недостаточно средств на карте гражданина.' });
        setLoading(false);
        return;
      }

      const newBalance = Number(card.balance) - Number(amount);
      await updateCardBalanceInDB(card.card_number, newBalance);

      // Create transaction logs
      const tx = {
        id: Math.random().toString(36).substr(2, 9),
        sender_card: card.card_number,
        receiver_card: null,
        amount: Number(amount),
        description: `Снятие наличных банкиром`,
        transaction_type: 'cash_withdrawal',
        meta_info: {
          branch: branchNumber,
          banker: user.passport_code
        },
        created_at: new Date().toISOString()
      };

      await createTransactionInDB(tx);
      setAmount('');
      setMsg({ type: 'success', text: `Наличные (${amount} }|{) успешно списаны с карты ${card.card_number} (Отделение/Банкомат №${branchNumber})` });
      loadAdminData();
      if (onAdminAction) onAdminAction();
    } catch (err) {
      setMsg({ type: 'error', text: 'Ошибка проведения транзакции.' });
    } finally {
      setLoading(false);
    }
  };

  const handleGovPayout = async (e) => {
    e.preventDefault();
    if (!selectedCard || !amount || Number(amount) <= 0 || !govPayoutTitle || !govPayoutStatement) return;

    setLoading(true);
    setMsg({ type: '', text: '' });

    try {
      const targetUser = users.find(u => u.cards.some(c => c.card_number === selectedCard));
      const card = targetUser?.cards.find(c => c.card_number === selectedCard);

      if (!card) {
        setMsg({ type: 'error', text: 'Карта не найдена.' });
        setLoading(false);
        return;
      }

      const newBalance = Number(card.balance) + Number(amount);
      await updateCardBalanceInDB(card.card_number, newBalance);

      const tx = {
        id: Math.random().toString(36).substr(2, 9),
        sender_card: null,
        receiver_card: card.card_number,
        amount: Number(amount),
        description: `Государственная выплата: ${govPayoutTitle}`,
        transaction_type: 'gov_payout',
        meta_info: {
          statement_number: govPayoutStatement,
          banker: user.passport_code
        },
        created_at: new Date().toISOString()
      };

      await createTransactionInDB(tx);
      setAmount('');
      setMsg({ type: 'success', text: `Государственная выплата (${amount} }|{) успешно начислена на карту ${card.card_number} по заявлению №${govPayoutStatement}` });
      loadAdminData();
      if (onAdminAction) onAdminAction();
    } catch (err) {
      setMsg({ type: 'error', text: 'Ошибка начисления выплаты.' });
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="glass-card p-8 rounded-3xl border border-white/5 max-w-md mx-auto space-y-6">
        <div className="text-center">
          <div className="inline-flex p-4 bg-yellow-500/10 rounded-2xl mb-3 border border-yellow-500/20">
            <Landmark className="w-8 h-8 text-yellow-400" />
          </div>
          <h2 className="text-lg font-black text-white">Доступ к панели банкира</h2>
          <p className="text-xs text-gray-400 mt-1">Введите секретный пин-код сотрудника Нацбанка</p>
        </div>

        {msg.text && (
          <div className={`p-4 rounded-xl text-xs font-semibold ${msg.type === 'error' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-green-500/10 text-green-400 border border-green-500/20'}`}>
            {msg.text}
          </div>
        )}

        <form onSubmit={handleAuthenticate} className="space-y-4">
          <input 
            type="password" 
            value={bankersCode}
            onChange={(e) => setBankersCode(e.target.value)}
            placeholder="Секретный код"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-center text-white placeholder-gray-600 font-extrabold tracking-widest focus:outline-none focus:border-yellow-500"
          />
          <button
            type="submit"
            className="w-full bg-yellow-500 hover:bg-yellow-600 text-black font-extrabold py-3.5 rounded-xl text-xs tracking-wider uppercase transition-all"
          >
            Подтвердить
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-6 select-none">
      {/* Banker Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-tr from-yellow-400 to-amber-600 rounded-2xl">
            <Landmark className="w-6 h-6 text-black" />
          </div>
          <div>
            <h2 className="text-xl font-extrabold text-white">Администрация Нацбанка</h2>
            <p className="text-xs text-yellow-400 font-medium">Работник банка: {user.first_name} {user.last_name}</p>
          </div>
        </div>

        {/* Banker navigation */}
        <div className="flex gap-1.5 bg-white/5 p-1 rounded-xl text-xs">
          <button onClick={() => { setActiveTab('users'); setMsg({ type: '', text: '' }); }} className={`px-3 py-2 rounded-lg font-bold transition-all ${activeTab === 'users' ? 'bg-yellow-500 text-black' : 'text-gray-400 hover:text-white'}`}>Пользователи</button>
          <button onClick={() => { setActiveTab('requests'); setMsg({ type: '', text: '' }); }} className={`px-3 py-2 rounded-lg font-bold transition-all ${activeTab === 'requests' ? 'bg-yellow-500 text-black' : 'text-gray-400 hover:text-white'} flex items-center gap-1`}>
            Заявки {employerRequests.filter(r => r.status === 'pending').length > 0 && <span className="bg-red-500 text-white rounded-full px-1.5 py-0.5 text-[8px]">{employerRequests.filter(r => r.status === 'pending').length}</span>}
          </button>
          <button onClick={() => { setActiveTab('withdraw'); setMsg({ type: '', text: '' }); }} className={`px-3 py-2 rounded-lg font-bold transition-all ${activeTab === 'withdraw' ? 'bg-yellow-500 text-black' : 'text-gray-400 hover:text-white'}`}>Снятие наличных</button>
          <button onClick={() => { setActiveTab('gov'); setMsg({ type: '', text: '' }); }} className={`px-3 py-2 rounded-lg font-bold transition-all ${activeTab === 'gov' ? 'bg-yellow-500 text-black' : 'text-gray-400 hover:text-white'}`}>Гос. выплаты</button>
        </div>
      </div>

      {msg.text && (
        <div className={`p-4 rounded-xl text-xs font-semibold ${msg.type === 'error' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-green-500/10 text-green-400 border border-green-500/20'}`}>
          {msg.text}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 text-yellow-400 animate-spin" />
        </div>
      ) : (
        <>
          {/* TAB: USERS LIST */}
          {activeTab === 'users' && (
            <div className="glass-card rounded-2xl border border-white/5 overflow-hidden">
              <div className="p-4 border-b border-white/5 flex items-center justify-between">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Зарегистрированные граждане в банке</span>
                <span className="text-xs bg-white/5 px-2.5 py-1 rounded-full text-white font-semibold">Всего: {users.length}</span>
              </div>
              <div className="divide-y divide-white/5 max-h-[400px] overflow-y-auto">
                {users.map(u => (
                  <div key={u.passport_code} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-white/[0.02] transition-all">
                    <div>
                      <h4 className="text-sm font-bold text-white">{u.first_name} {u.last_name}</h4>
                      <div className="flex flex-wrap gap-2 mt-1 text-[10px] text-gray-400">
                        <span>Паспорт: <b className="text-white font-mono">{u.passport_code}</b></span>
                        {u.discord_tag && <span>Ник: <b className="text-[#39FF14]">{u.discord_tag}</b></span>}
                        {u.is_employer_approved && <span className="text-yellow-400">Компания: <b>{u.employer_company_name}</b></span>}
                      </div>
                    </div>
                    
                    {/* Cards of User */}
                    <div className="flex flex-wrap gap-2">
                      {u.cards.map(c => (
                        <div key={c.card_number} className="bg-black/40 border border-white/5 px-3 py-1.5 rounded-xl text-right">
                          <div className="text-[9px] text-gray-500 font-mono">{c.card_number}</div>
                          <div className="text-xs font-black text-white">
                            {Number(c.balance).toFixed(2)} <span className="text-yellow-500 text-[10px]">{"}|{"}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB: EMPLOYER REQUESTS */}
          {activeTab === 'requests' && (
            <div className="glass-card rounded-2xl border border-white/5 overflow-hidden">
              <div className="p-4 border-b border-white/5">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Заявки на регистрацию работодателя</span>
              </div>
              <div className="divide-y divide-white/5">
                {employerRequests.length === 0 ? (
                  <p className="text-xs text-gray-500 p-6 text-center">Заявок на данный момент нет</p>
                ) : (
                  employerRequests.map(req => (
                    <div key={req.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-white/[0.02] transition-all">
                      <div>
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${req.status === 'pending' ? 'bg-yellow-500/10 text-yellow-400' : req.status === 'approved' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                          {req.status === 'pending' ? 'Ожидает одобрения' : req.status === 'approved' ? 'Одобрено' : 'Отклонено'}
                        </span>
                        <h4 className="text-sm font-black text-white mt-1.5">Компания: &ldquo;{req.company_name}&rdquo;</h4>
                        <p className="text-[10px] text-gray-400 mt-0.5">Владелец паспорта: <span className="font-mono text-white">{req.passport_code}</span></p>
                      </div>

                      {req.status === 'pending' && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleRejectEmployer(req.id)}
                            className="bg-red-500/10 hover:bg-red-500/20 text-red-400 p-2 rounded-xl text-xs transition-all"
                          >
                            <X className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleApproveEmployer(req.id)}
                            className="bg-green-500/10 hover:bg-green-500/20 text-green-400 px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1"
                          >
                            <Check className="w-4 h-4" /> Одобрить
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB: WITHDRAW CASH */}
          {activeTab === 'withdraw' && (
            <div className="glass-card p-6 rounded-2xl border border-white/5 space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-yellow-400" />
                <span>Списание наличных с карты игрока</span>
              </h3>
              
              <form onSubmit={handleWithdrawCash} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5">Выберите карту гражданина</label>
                    <select
                      value={selectedCard}
                      onChange={(e) => setSelectedCard(e.target.value)}
                      required
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-xs font-semibold focus:outline-none focus:border-yellow-500"
                    >
                      <option value="" className="bg-black text-white">Выбрать...</option>
                      {users.map(u => u.cards.map(c => (
                        <option key={c.card_number} value={c.card_number} className="bg-black text-white">
                          {u.first_name} {u.last_name} ({c.card_title}) - {Number(c.balance).toFixed(2)} {"}|{"}
                        </option>
                      )))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5">Номер отделения или банкомата</label>
                    <input
                      type="text"
                      value={branchNumber}
                      onChange={(e) => setBranchNumber(e.target.value)}
                      placeholder="Например: Отделение №1 / Банкомат №45"
                      required
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-xs font-semibold focus:outline-none focus:border-yellow-500"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5">Сумма к списанию (Жоронов {"}|{"})</label>
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      required
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-xs font-semibold focus:outline-none focus:border-yellow-500"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-yellow-500 hover:bg-yellow-600 text-black py-3.5 rounded-xl text-xs font-extrabold uppercase transition-all flex justify-center items-center shadow-lg"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Провести снятие наличных <ArrowUpRight className="w-4 h-4 ml-1.5" /></>}
                </button>
              </form>
            </div>
          )}

          {/* TAB: GOV PAYOUT */}
          {activeTab === 'gov' && (
            <div className="glass-card p-6 rounded-2xl border border-white/5 space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Award className="w-4 h-4 text-yellow-400" />
                <span>Начисление государственной выплаты</span>
              </h3>
              
              <form onSubmit={handleGovPayout} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5">Получатель (Выбрать карту)</label>
                    <select
                      value={selectedCard}
                      onChange={(e) => setSelectedCard(e.target.value)}
                      required
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-xs font-semibold focus:outline-none focus:border-yellow-500"
                    >
                      <option value="" className="bg-black text-white">Выбрать...</option>
                      {users.map(u => u.cards.map(c => (
                        <option key={c.card_number} value={c.card_number} className="bg-black text-white">
                          {u.first_name} {u.last_name} ({c.card_title})
                        </option>
                      )))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5">Номер поданного заявления</label>
                    <input
                      type="text"
                      value={govPayoutStatement}
                      onChange={(e) => setGovPayoutStatement(e.target.value)}
                      placeholder="Пример: Заявление №93/А"
                      required
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-xs font-semibold focus:outline-none focus:border-yellow-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5">Название/Тип выплаты</label>
                    <input
                      type="text"
                      value={govPayoutTitle}
                      onChange={(e) => setGovPayoutTitle(e.target.value)}
                      placeholder="Например: Пособие по безработице или Грант"
                      required
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-xs font-semibold focus:outline-none focus:border-yellow-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5">Сумма (Жоронов {"}|{"})</label>
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      required
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-xs font-semibold focus:outline-none focus:border-yellow-500"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-yellow-400 to-amber-500 text-black py-3.5 rounded-xl text-xs font-extrabold uppercase transition-all flex justify-center items-center shadow-lg"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Провести выплату из бюджета <ArrowUpRight className="w-4 h-4 ml-1.5" /></>}
                </button>
              </form>
            </div>
          )}
        </>
      )}
    </div>
  );
}
