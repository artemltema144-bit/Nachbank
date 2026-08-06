import React, { useState, useEffect } from 'react';
import { searchPassportInGoogleSheets } from '../utils/googleSheets';
import { fetchUserFromDB, saveUserToDB, createCardInDB, fetchCardsForUser } from '../utils/simulation';
import { initializeDatabase } from '../utils/supabase';
import { Landmark, User, ShieldCheck, KeyRound, Loader2, ArrowRight, AlertTriangle, Copy, Check } from 'lucide-react';
import confetti from 'canvas-confetti';

export default function LoginRegister({ onLoginSuccess }) {
  const [passportCode, setPassportCode] = useState('');
  const [password, setPassword] = useState('');
  const [loginPassport, setLoginPassport] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  
  const [mode, setMode] = useState('login'); // 'login', 'register'
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState({ type: '', text: '' });
  
  // Registration step state
  const [regStep, setRegStep] = useState(1); // 1: Enter passport, 2: Choose password
  const [foundCitizen, setFoundCitizen] = useState(null);

  // Database initialization check
  const [isDbInitialized, setIsDbInitialized] = useState(true);
  const [showSqlModal, setShowSqlModal] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    checkDatabase();
  }, []);

  const checkDatabase = async () => {
    const ok = await initializeDatabase();
    setIsDbInitialized(ok);
  };

  const triggerConfetti = () => {
    confetti({
      particleCount: 150,
      spread: 80,
      origin: { y: 0.6 }
    });
  };

  const handlePassportSearch = async (e) => {
    e.preventDefault();
    if (!passportCode) return;
    
    setLoading(true);
    setStatusMsg({ type: '', text: '' });
    
    try {
      // 1. Check if user already registered in Supabase
      const existingUser = await fetchUserFromDB(passportCode);
      if (existingUser) {
        setStatusMsg({ 
          type: 'error', 
          text: 'Этот паспорт уже зарегистрирован в банке! Пожалуйста, войдите в личный кабинет.' 
        });
        setLoading(false);
        return;
      }

      // 2. Search in Google Sheets
      const res = await searchPassportInGoogleSheets(passportCode);
      if (res.error) {
        setStatusMsg({ type: 'error', text: res.error });
      } else if (res.success) {
        setFoundCitizen(res);
        setRegStep(2);
      }
    } catch (err) {
      setStatusMsg({ type: 'error', text: 'Ошибка сети. Попробуйте еще раз.' });
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    if (!password || password.length < 4) {
      setStatusMsg({ type: 'error', text: 'Пароль (PIN) должен содержать минимум 4 символа/цифры' });
      return;
    }

    setLoading(true);
    setStatusMsg({ type: '', text: '' });

    try {
      // Generate unique card number
      const generateCardNumber = () => {
        let num = '4441';
        for (let i = 0; i < 12; i++) {
          num += Math.floor(Math.random() * 10).toString();
        }
        return num.replace(/(\d{4})/g, '$1 ').trim();
      };

      const cardNum = generateCardNumber();
      
      const newUser = {
        passport_code: foundCitizen.passportCode,
        first_name: foundCitizen.firstName,
        last_name: foundCitizen.lastName,
        discord_tag: foundCitizen.discordTag || '',
        password_hash: password, // For gaming simple bank, plain pin is standard
        is_employer: false,
        is_employer_approved: false,
        created_at: new Date().toISOString()
      };

      const newCard = {
        card_number: cardNum,
        passport_code: foundCitizen.passportCode,
        card_type: 'personal',
        card_title: 'Личная карта',
        balance: 100.00, // Welcome bonus of 100 Jhorons!
        created_at: new Date().toISOString()
      };

      // Save user & card
      await saveUserToDB(newUser);
      await createCardInDB(newCard);

      triggerConfetti();
      setStatusMsg({ 
        type: 'success', 
        text: `Поздравляем! Карта успешно выпущена. Номер карты: ${cardNum}. Запомните ваш пароль!` 
      });
      
      // Auto-login
      setTimeout(() => {
        onLoginSuccess(newUser, [newCard]);
      }, 3000);

    } catch (err) {
      setStatusMsg({ type: 'error', text: 'Ошибка регистрации. Попробуйте снова.' });
    } finally {
      setLoading(false);
    }
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    if (!loginPassport || !loginPassword) return;

    setLoading(true);
    setStatusMsg({ type: '', text: '' });

    try {
      // Try fetching by passport first, or scan database for card login
      let user = await fetchUserFromDB(loginPassport);
      
      // If not found by passport, let's see if the input was a card number (without spaces)
      if (!user) {
        const cleanCard = loginPassport.replace(/\s+/g, '');
        const allUsers = await fetchUserFromDB(); // If simple db has all
        // Wait, fetchUserFromDB requires code, so we can fetch all cards to map
        // To support card number login perfectly, we can check our local db first
        const localData = localStorage.getItem("monobank_irnovia_sim_db");
        if (localData) {
          const db = JSON.parse(localData);
          const matchedCard = db.cards.find(c => c.card_number.replace(/\s+/g, '') === cleanCard);
          if (matchedCard) {
            user = db.users.find(u => u.passport_code === matchedCard.passport_code);
          }
        }
      }

      if (!user) {
        setStatusMsg({ type: 'error', text: 'Пользователь с таким Паспортом или Картой не зарегистрирован' });
        setLoading(false);
        return;
      }

      if (user.password_hash !== loginPassword) {
        setStatusMsg({ type: 'error', text: 'Неверный пароль (PIN-код)' });
        setLoading(false);
        return;
      }

      // Fetch user's cards
      const cards = await fetchCardsForUser(user.passport_code);
      triggerConfetti();
      onLoginSuccess(user, cards);
    } catch (err) {
      setStatusMsg({ type: 'error', text: 'Ошибка авторизации. Проверьте подключение.' });
    } finally {
      setLoading(false);
    }
  };

  const sqlSetupCode = `-- Таблицы для Нацбанка Ирновии
CREATE TABLE IF NOT EXISTS public.bank_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    passport_code TEXT UNIQUE NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    discord_tag TEXT,
    password_hash TEXT NOT NULL,
    is_employer BOOLEAN DEFAULT FALSE,
    employer_company_name TEXT,
    is_employer_approved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.bank_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_number TEXT UNIQUE NOT NULL,
    passport_code TEXT NOT NULL REFERENCES public.bank_users(passport_code) ON DELETE CASCADE,
    card_type TEXT NOT NULL,
    card_title TEXT NOT NULL,
    balance NUMERIC(15, 2) DEFAULT 0.00 NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.bank_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_card TEXT,
    receiver_card TEXT,
    amount NUMERIC(15, 2) NOT NULL,
    description TEXT,
    transaction_type TEXT NOT NULL,
    meta_info JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.bank_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_passport TEXT NOT NULL,
    receiver_passport TEXT NOT NULL,
    amount NUMERIC(15, 2) NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'pending' NOT NULL,
    is_forced BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.bank_employer_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    passport_code TEXT NOT NULL REFERENCES public.bank_users(passport_code) ON DELETE CASCADE,
    company_name TEXT NOT NULL,
    status TEXT DEFAULT 'pending' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.bank_users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_cards DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_invoices DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_employer_requests DISABLE ROW LEVEL SECURITY;`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(sqlSetupCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center px-4 bg-black select-none">
      {/* Background Neon Glows */}
      <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-[#FF007F] rounded-full blur-[150px] opacity-20 pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-[#7B00FF] rounded-full blur-[150px] opacity-20 pointer-events-none"></div>

      {/* SQL Warning Notice Banner */}
      {!isDbInitialized && (
        <div className="w-full max-w-md bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 p-4 rounded-2xl text-xs mb-4 flex items-start gap-3 backdrop-blur-md">
          <AlertTriangle className="w-5 h-5 text-yellow-400 shrink-0" />
          <div className="flex-1">
            <h4 className="font-bold text-white mb-0.5">База данных не инициализирована!</h4>
            <p className="leading-relaxed">Созданные карты сейчас сохраняются только локально на вашем устройстве. Чтобы включить полную синхронизацию (компьютер + телефон), нажмите кнопку ниже.</p>
            <button 
              onClick={() => setShowSqlModal(true)}
              className="mt-2 text-[10px] bg-yellow-500 hover:bg-yellow-600 text-black font-extrabold px-3 py-1.5 rounded-lg transition-all"
            >
              Включить синхронизацию (SQL)
            </button>
          </div>
        </div>
      )}

      {/* Main Container */}
      <div className="w-full max-w-md glass-card p-8 rounded-3xl relative overflow-hidden z-10 border border-white/10 shadow-2xl">
        
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-tr from-[#FF007F] to-[#7B00FF] rounded-2xl mb-4 shadow-lg shadow-[#FF007F]/20 animate-pulse">
            <span className="text-white text-3xl font-extrabold font-mono">{"}|{"}</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white uppercase">
            Нацбанк Ирновии
          </h1>
          <p className="text-sm text-gray-400 mt-1">Официальный банк Царства Ирновия</p>
        </div>

        {/* Mode Switcher */}
        <div className="flex bg-white/5 p-1 rounded-xl mb-6">
          <button 
            onClick={() => { setMode('login'); setStatusMsg({ type: '', text: '' }); }}
            className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all ${mode === 'login' ? 'bg-[#FF007F] text-white shadow-md' : 'text-gray-400 hover:text-white'}`}
          >
            Вход в кабинет
          </button>
          <button 
            onClick={() => { setMode('register'); setStatusMsg({ type: '', text: '' }); }}
            className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all ${mode === 'register' ? 'bg-[#FF007F] text-white shadow-md' : 'text-gray-400 hover:text-white'}`}
          >
            Регистрация карты
          </button>
        </div>

        {/* Status Messages */}
        {statusMsg.text && (
          <div className={`p-4 rounded-xl mb-6 text-sm font-medium ${statusMsg.type === 'error' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-green-500/10 text-green-400 border border-green-500/20'}`}>
            {statusMsg.text}
          </div>
        )}

        {/* Login Mode */}
        {mode === 'login' && (
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Код паспорта или Номер карты</label>
              <div className="relative">
                <input 
                  type="text" 
                  value={loginPassport}
                  onChange={(e) => setLoginPassport(e.target.value)}
                  placeholder="А•01•090426•001 или 4441..."
                  required
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 pl-11 text-white placeholder-gray-500 focus:outline-none focus:border-[#FF007F] transition-all text-sm font-medium"
                />
                <User className="absolute left-4 top-4 w-4 h-4 text-gray-500" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Пароль / PIN-код</label>
              <div className="relative">
                <input 
                  type="password" 
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Введите ваш PIN"
                  required
                  maxLength={10}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 pl-11 text-white placeholder-gray-500 focus:outline-none focus:border-[#FF007F] transition-all text-sm font-medium tracking-widest"
                />
                <KeyRound className="absolute left-4 top-4 w-4 h-4 text-gray-500" />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-white text-black hover:bg-gray-100 disabled:opacity-50 py-4 rounded-xl font-bold text-sm transition-all shadow-lg flex justify-center items-center"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>Войти в Нацбанк <ArrowRight className="w-4 h-4 ml-2" /></>
              )}
            </button>
          </form>
        )}

        {/* Register Mode */}
        {mode === 'register' && (
          <div>
            {regStep === 1 ? (
              <form onSubmit={handlePassportSearch} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Код вашего паспорта Ирновии</label>
                  <p className="text-xs text-gray-500 mb-3">Карта привязывается к вашему официальному паспорту из реестра</p>
                  <div className="relative">
                    <input 
                      type="text" 
                      value={passportCode}
                      onChange={(e) => setPassportCode(e.target.value)}
                      placeholder="Пример: С•01•191125•001"
                      required
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 pl-11 text-white placeholder-gray-500 focus:outline-none focus:border-[#FF007F] transition-all text-sm font-medium uppercase"
                    />
                    <Landmark className="absolute left-4 top-4 w-4 h-4 text-gray-500" />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#FF007F] hover:bg-[#FF007F]/90 disabled:opacity-50 py-4 rounded-xl font-bold text-sm transition-all shadow-lg shadow-[#FF007F]/20 flex justify-center items-center"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>Проверить по реестру <ArrowRight className="w-4 h-4 ml-2" /></>
                  )}
                </button>
              </form>
            ) : (
              <form onSubmit={handleRegisterSubmit} className="space-y-4">
                <div className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-4">
                  <span className="text-xs font-bold text-[#FF007F] uppercase tracking-wider">Гражданин подтвержден</span>
                  <h3 className="text-lg font-black mt-1 text-white">
                    {foundCitizen.firstName} {foundCitizen.lastName}
                  </h3>
                  <div className="grid grid-cols-2 gap-2 mt-3 text-xs text-gray-400">
                    <div>Год рожд.: <b className="text-white">{foundCitizen.birthYear}</b></div>
                    <div>Пол: <b className="text-white">{foundCitizen.gender}</b></div>
                    {foundCitizen.discordTag && (
                      <div className="col-span-2 mt-1">Никнейм: <b className="text-[#39FF14]">{foundCitizen.discordTag}</b></div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Установите ваш пароль (PIN-код)</label>
                  <div className="relative">
                    <input 
                      type="password" 
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Минимум 4 цифры/символа"
                      required
                      maxLength={10}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 pl-11 text-white placeholder-gray-500 focus:outline-none focus:border-[#FF007F] transition-all text-sm font-medium tracking-widest"
                    />
                    <KeyRound className="absolute left-4 top-4 w-4 h-4 text-gray-500" />
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setRegStep(1)}
                    className="flex-1 border border-white/10 hover:bg-white/5 py-4 rounded-xl font-bold text-sm transition-all"
                  >
                    Назад
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-[2] bg-gradient-to-r from-[#FF007F] to-[#7B00FF] hover:opacity-90 disabled:opacity-50 py-4 rounded-xl font-bold text-sm transition-all shadow-lg shadow-[#FF007F]/20 flex justify-center items-center"
                  >
                    {loading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>Открыть счет <ShieldCheck className="w-4 h-4 ml-2" /></>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>

      {/* SQL SCHEMA INITIALIZATION INSTRUCTION MODAL */}
      {showSqlModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="w-full max-w-lg bg-[#1F2833] border border-white/10 rounded-3xl p-6 shadow-2xl relative space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="text-center">
              <div className="inline-flex p-3 bg-yellow-500/10 rounded-full border border-yellow-500/20 mb-2">
                <Landmark className="w-6 h-6 text-yellow-400" />
              </div>
              <h3 className="text-lg font-black text-white">Включение синхронизации устройств</h3>
              <p className="text-xs text-gray-400 mt-1">Скопируйте SQL-код ниже и выполните его в панели Supabase</p>
            </div>

            <div className="text-xs text-gray-300 leading-relaxed space-y-2">
              <p>Для того чтобы облако Supabase заработало и синхронизировало ваши устройства (компьютер + телефон):</p>
              <ol className="list-decimal pl-4 space-y-1 text-gray-400">
                <li>Зайдите в ваш проект на сайте <b className="text-white">supabase.com</b></li>
                <li>В меню слева найдите раздел <b className="text-white">SQL Editor</b> (иконка <b className="font-mono">{">_"}</b>)</li>
                <li>Нажмите <b className="text-white">New Query</b></li>
                <li>Вставьте скопированный ниже код в редактор</li>
                <li>Нажмите кнопку <b className="text-yellow-400">Run</b> в верхнем правом углу панели</li>
              </ol>
            </div>

            <div className="relative bg-black/50 border border-white/5 rounded-xl p-4 overflow-hidden">
              <pre className="text-[10px] text-gray-400 font-mono overflow-x-auto max-h-40 leading-relaxed whitespace-pre select-all">
                {sqlSetupCode}
              </pre>
              <button 
                onClick={copyToClipboard}
                className="absolute top-2 right-2 bg-white/10 hover:bg-white/20 text-white p-2 rounded-lg transition-all"
                title="Копировать код"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setShowSqlModal(false); checkDatabase(); }}
                className="w-full bg-yellow-500 hover:bg-yellow-600 text-black font-extrabold py-3.5 rounded-xl text-xs uppercase transition-all"
              >
                Готово, SQL выполнен!
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
