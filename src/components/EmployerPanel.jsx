import React, { useState, useEffect } from 'react';
import { createEmployerRequestInDB, fetchEmployerRequestsFromDB, createCardInDB, adminFetchAllUsers, updateCardBalanceInDB, createTransactionInDB } from '../utils/simulation';
import { searchPassportInGoogleSheets } from '../utils/googleSheets';
import { Briefcase, Plus, Loader2, ArrowRight, ShieldCheck, CreditCard, Send, Landmark, Coins } from 'lucide-react';

export default function EmployerPanel({ user, onCardCreated }) {
  const [companyName, setCompanyName] = useState('');
  const [employeePassport, setEmployeePassport] = useState('');
  const [cardType, setCardType] = useState('salary'); // 'salary', 'pension'

  const [loading, setLoading] = useState(false);
  const [requestStatus, setRequestStatus] = useState(null);
  const [msg, setMsg] = useState({ type: '', text: '' });

  // List of cards issued by this company (derived from all cards)
  const [issuedCards, setIssuedCards] = useState([]);

  // Quick payment state
  const [paymentAmount, setTransferAmount] = useState('');
  const [activePaymentCard, setActivePaymentCard] = useState(null);
  const [paymentLoading, setPaymentLoading] = useState(false);

  useEffect(() => {
    checkMyRequest();
  }, []);

  const checkMyRequest = async () => {
    const reqs = await fetchEmployerRequestsFromDB();
    const myReq = reqs.find(r => r.passport_code === user.passport_code);
    if (myReq) {
      setRequestStatus(myReq);
    }
    if (user.is_employer_approved) {
      loadIssuedCards();
    }
  };

  const loadIssuedCards = async () => {
    const allUsers = await adminFetchAllUsers();
    // Gather all salary/pension cards belonging to this company's name
    const cards = [];
    allUsers.forEach(u => {
      u.cards.forEach(c => {
        if ((c.card_type === 'salary' || c.card_type === 'pension') && c.card_title.includes(user.employer_company_name)) {
          cards.push({
            ...c,
            employeeName: `${u.first_name} ${u.last_name}`,
            discord_tag: u.discord_tag
          });
        }
      });
    });
    setIssuedCards(cards);
  };

  const handleRegisterCompany = async (e) => {
    e.preventDefault();
    if (!companyName) return;

    setLoading(true);
    setMsg({ type: '', text: '' });

    try {
      const newReq = {
        id: Math.random().toString(36).substr(2, 9),
        passport_code: user.passport_code,
        company_name: companyName,
        status: 'pending',
        created_at: new Date().toISOString()
      };

      await createEmployerRequestInDB(newReq);
      setRequestStatus(newReq);
      setMsg({ type: 'success', text: 'Заявка отправлена! Ожидайте одобрения Администратором банка.' });
    } catch (err) {
      setMsg({ type: 'error', text: 'Ошибка отправки заявки.' });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateEmployeeCard = async (e) => {
    e.preventDefault();
    if (!employeePassport) return;

    setLoading(true);
    setMsg({ type: '', text: '' });

    try {
      // 1. Verify citizen exists in registry
      const citizen = await searchPassportInGoogleSheets(employeePassport);
      if (citizen.error) {
        setMsg({ type: 'error', text: citizen.error });
        setLoading(false);
        return;
      }

      // 2. Create card
      const generateCardNumber = () => {
        let num = cardType === 'salary' ? '4441' : '4442'; // 4441 for salary, 4442 for pension
        for (let i = 0; i < 12; i++) {
          num += Math.floor(Math.random() * 10).toString();
        }
        return num.replace(/(\d{4})/g, '$1 ').trim();
      };

      const cardNum = generateCardNumber();
      const cardTitle = cardType === 'salary' ? 'Зарплатная карта' : 'Пенсионная карта';

      const newCard = {
        card_number: cardNum,
        passport_code: citizen.passportCode,
        card_type: cardType,
        card_title: `${cardTitle} (${user.employer_company_name})`,
        balance: 0.00,
        created_at: new Date().toISOString()
      };

      await createCardInDB(newCard);
      setEmployeePassport('');
      setMsg({
        type: 'success',
        text: `Успешно! Создана ${cardTitle} для ${citizen.firstName} ${citizen.lastName}. Номер: ${cardNum}`
      });
      loadIssuedCards();
      if (onCardCreated) onCardCreated();
    } catch (err) {
      setMsg({ type: 'error', text: 'Ошибка выпуска карты сотруднику.' });
    } finally {
      setLoading(false);
    }
  };

  const handleQuickTransfer = async (e) => {
    e.preventDefault();
    if (!activePaymentCard || !paymentAmount || Number(paymentAmount) <= 0) return;

    setPaymentLoading(true);
    setMsg({ type: '', text: '' });

    try {
      // Direct transfer from company's main account to employee's salary card!
      // Company's main account balance is determined by the employer's main card balance
      const allUsers = await adminFetchAllUsers();
      const employerUserObj = allUsers.find(u => u.passport_code === user.passport_code);
      const employerMainCard = employerUserObj?.cards.find(c => c.card_type === 'personal');

      if (!employerMainCard) {
        setMsg({ type: 'error', text: 'Не найден личный счет работодателя для списания средств.' });
        setPaymentLoading(false);
        return;
      }

      if (Number(employerMainCard.balance) < Number(paymentAmount)) {
        setMsg({ type: 'error', text: 'Недостаточно личных средств компании для осуществления выплаты.' });
        setPaymentLoading(false);
        return;
      }

      // Update balances
      const employerNewBal = Number(employerMainCard.balance) - Number(paymentAmount);
      const employeeNewBal = Number(activePaymentCard.balance) + Number(paymentAmount);

      await updateCardBalanceInDB(employerMainCard.card_number, employerNewBal);
      await updateCardBalanceInDB(activePaymentCard.card_number, employeeNewBal);

      // Create transaction logs
      const tx = {
        id: Math.random().toString(36).substr(2, 9),
        sender_card: employerMainCard.card_number,
        receiver_card: activePaymentCard.card_number,
        amount: Number(paymentAmount),
        description: `Выплата сотруднику (${user.employer_company_name})`,
        transaction_type: 'transfer',
        created_at: new Date().toISOString()
      };

      await createTransactionInDB(tx);
      setTransferAmount('');
      setActivePaymentCard(null);
      setMsg({ type: 'success', text: `Успешно начислено ${paymentAmount} {"}|{"} на карту сотрудника ${activePaymentCard.employeeName}!` });
      loadIssuedCards();
      if (onCardCreated) onCardCreated();
    } catch (err) {
      setMsg({ type: 'error', text: 'Ошибка проведения перевода.' });
    } finally {
      setPaymentLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-gradient-to-tr from-[#00F0FF] to-[#004BFF] rounded-2xl">
          <Briefcase className="w-6 h-6 text-white" />
        </div>
        <div>
          <h2 className="text-xl font-extrabold text-white">Кабинет Работодателя</h2>
          <p className="text-xs text-gray-400">Выпуск пенсионных и зарплатных карт, быстрое зачисление средств</p>
        </div>
      </div>

      {msg.text && (
        <div className={`p-4 rounded-xl text-sm font-medium ${msg.type === 'error' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-green-500/10 text-green-400 border border-green-500/20'}`}>
          {msg.text}
        </div>
      )}

      {/* If not approved yet */}
      {!user.is_employer_approved ? (
        <div className="glass-card p-6 rounded-2xl border border-white/5 space-y-4">
          <h3 className="text-base font-bold text-white">Регистрация компании / бизнеса</h3>
          <p className="text-xs text-gray-400 leading-relaxed">
            Чтобы выпускать сотрудникам корпоративные, зарплатные или пенсионные карты, вам необходимо зарегистрировать свой бизнес. После отправки заявки, Администраторы банка проверят информацию и одобрят кабинет.
          </p>

          {requestStatus ? (
            <div className="p-4 rounded-xl bg-yellow-500/5 border border-yellow-500/20 text-yellow-400 text-xs">
              Ваша заявка компании <b>&ldquo;{requestStatus.company_name}&rdquo;</b> находится на рассмотрении Администратора.
            </div>
          ) : (
            <form onSubmit={handleRegisterCompany} className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5">Название компании / Органа</label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Например: УК г. Ирновки или Магазин Ашот"
                  required
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-[#00F0FF] text-xs font-semibold"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-[#00F0FF] to-[#004BFF] py-3.5 rounded-xl font-bold text-xs text-white transition-all shadow-md flex justify-center items-center"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Подать заявку на компанию <ArrowRight className="w-3.5 h-3.5 ml-1.5" /></>}
              </button>
            </form>
          )}
        </div>
      ) : (
        /* If Approved, render Company tools */
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* Create Employee Card form */}
            <div className="glass-card p-6 rounded-2xl border border-white/5 space-y-4">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-[#00F0FF]" />
                <h3 className="text-base font-bold text-white">Выпуск карты сотруднику</h3>
              </div>

              <form onSubmit={handleCreateEmployeeCard} className="space-y-3">
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5">Код паспорта сотрудника</label>
                  <input
                    type="text"
                    value={employeePassport}
                    onChange={(e) => setEmployeePassport(e.target.value)}
                    placeholder="Пример: С•01•191125•001"
                    required
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-[#00F0FF] text-xs font-semibold uppercase"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5">Тип карты</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setCardType('salary')}
                      className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all border ${cardType === 'salary' ? 'bg-[#00F0FF] text-black border-[#00F0FF]' : 'bg-white/5 text-gray-400 border-white/10'}`}
                    >
                      Зарплатная
                    </button>
                    <button
                      type="button"
                      onClick={() => setCardType('pension')}
                      className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all border ${cardType === 'pension' ? 'bg-[#00F0FF] text-black border-[#00F0FF]' : 'bg-white/5 text-gray-400 border-white/10'}`}
                    >
                      Пенсионная
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-white text-black hover:bg-gray-100 py-3 rounded-xl font-extrabold text-xs transition-all flex justify-center items-center shadow-md"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Выпустить карту <CreditCard className="w-4 h-4 ml-1.5" /></>}
                </button>
              </form>
            </div>

            {/* Info and stats block */}
            <div className="glass-card p-6 rounded-2xl border border-white/5 space-y-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2 text-xs text-[#00F0FF] font-bold tracking-wider uppercase">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Организация Активна</span>
                </div>
                <h4 className="text-xl font-black text-white">{user.employer_company_name}</h4>
                <p className="text-xs text-gray-400 mt-2 leading-relaxed">
                  Поскольку ваша компания подтверждена администрацией Нацбанка Ирновии, вы уполномочены осуществлять выплаты заработной платы и пенсий гражданам.
                </p>
                <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                  Ниже представлен удобный список всех выпущенных вами карт. Вы можете мгновенно начислить выплаты любому сотруднику в 2 клика!
                </p>
              </div>

              <div className="p-3 bg-white/5 rounded-xl border border-white/5 text-[10px] text-gray-400">
                Код компании: <b className="text-white font-mono">{user.passport_code}</b>
              </div>
            </div>

          </div>

          {/* NEW SECTION: ISSUED CARDS LIST WITH QUICK PAYMENT */}
          <div className="glass-card rounded-2xl border border-white/5 overflow-hidden">
            <div className="p-4 border-b border-white/5 flex items-center justify-between">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                <Coins className="w-4 h-4 text-[#00F0FF]" /> Выпущенные карты сотрудников ({issuedCards.length})
              </span>
            </div>

            <div className="divide-y divide-white/5 max-h-[350px] overflow-y-auto">
              {issuedCards.length === 0 ? (
                <div className="p-8 text-center text-gray-500 text-xs">
                  У вашей компании еще нет сотрудников с выпущенными картами.
                </div>
              ) : (
                issuedCards.map(c => (
                  <div key={c.card_number} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-white/[0.01] transition-all">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded ${c.card_type === 'salary' ? 'bg-[#00F0FF]/10 text-[#00F0FF]' : 'bg-[#39FF14]/10 text-[#39FF14]'}`}>
                          {c.card_type === 'salary' ? 'Зарплатная' : 'Пенсионная'}
                        </span>
                        <h4 className="text-sm font-bold text-white">{c.employeeName}</h4>
                      </div>
                      <div className="flex gap-2 text-[10px] text-gray-500 mt-1 font-mono">
                        <span>Карта: {c.card_number}</span>
                        <span>•</span>
                        <span>Паспорт: {c.passport_code}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 justify-between sm:justify-end">
                      <div className="text-right">
                        <div className="text-[10px] text-gray-500">Баланс</div>
                        <div className="text-sm font-black text-white">
                          {Number(c.balance).toFixed(2)} <span className="text-[#00F0FF] text-[10px]">{"}|{"}</span>
                        </div>
                      </div>

                      <button
                        onClick={() => setActivePaymentCard(c)}
                        className="bg-[#00F0FF] hover:bg-[#00F0FF]/90 text-black font-extrabold px-3.5 py-2 rounded-xl text-xs transition-all flex items-center gap-1 shadow-md"
                      >
                        <Send className="w-3.5 h-3.5" /> Зачислить
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* QUICK PAYMENT MODAL FOR EMPLOYER */}
          {activePaymentCard && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md select-none">
              <div className="w-full max-w-sm bg-[#1F2833] border border-white/10 rounded-3xl p-6 shadow-2xl space-y-4">
                <div className="text-center">
                  <div className="inline-flex p-3 bg-[#00F0FF]/10 rounded-2xl mb-2">
                    <Coins className="w-6 h-6 text-[#00F0FF]" />
                  </div>
                  <h3 className="text-base font-black text-white">Быстрое зачисление средств</h3>
                  <p className="text-xs text-gray-400 mt-0.5">Получатель: <b className="text-white">{activePaymentCard.employeeName}</b></p>
                  <p className="text-[10px] text-gray-500 font-mono mt-0.5">{activePaymentCard.card_number}</p>
                </div>

                <form onSubmit={handleQuickTransfer} className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5">Сумма к зачислению (Жоронов {"}|{"})</label>
                    <input
                      type="number"
                      value={paymentAmount}
                      onChange={(e) => setTransferAmount(e.target.value)}
                      placeholder="0.00"
                      required
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-xs font-semibold focus:outline-none focus:border-[#00F0FF]"
                    />
                  </div>

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setActivePaymentCard(null)}
                      className="flex-1 border border-white/10 hover:bg-white/5 py-3 rounded-xl font-bold text-xs"
                    >
                      Отмена
                    </button>
                    <button
                      type="submit"
                      disabled={paymentLoading}
                      className="flex-[2] bg-gradient-to-r from-[#00F0FF] to-[#004BFF] text-white py-3 rounded-xl font-bold text-xs transition-all shadow-lg flex items-center justify-center gap-1"
                    >
                      {paymentLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-3.5 h-3.5" /> Подтвердить</>}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
