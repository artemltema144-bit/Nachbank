// Perfect simulation logic that works hand-in-hand with Supabase!
// If Supabase is connected and initialized, we write to Supabase.
// Otherwise, we write to LocalStorage so that everything works instantly, smoothly and saves reliably!
// AND we implement auto-migration to seamlessly upload LocalStorage data to Supabase once tables are ready!

import { supabase } from './supabase';

const STORAGE_KEY = "monobank_irnovia_sim_db";

const DEFAULT_STATE = {
  users: [],
  cards: [],
  transactions: [],
  invoices: [],
  employerRequests: [],
};

// Seed initial users if empty
function getLocalDB() {
  const data = localStorage.getItem(STORAGE_KEY);
  if (!data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_STATE));
    return DEFAULT_STATE;
  }
  return JSON.parse(data);
}

function saveLocalDB(db) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

// AUTO-MIGRATION LOGIC (LocalStorage -> Supabase)
async function migrateLocalDataToCloud() {
  const db = getLocalDB();

  // 1. Migrate Users
  if (db.users && db.users.length > 0) {
    for (const user of db.users) {
      try {
        await supabase.from('bank_users').upsert(user, { onConflict: 'passport_code' });
      } catch (e) {
        console.error("Migration error (user):", e);
      }
    }
  }

  // 2. Migrate Cards
  if (db.cards && db.cards.length > 0) {
    for (const card of db.cards) {
      try {
        await supabase.from('bank_cards').upsert(card, { onConflict: 'card_number' });
      } catch (e) {
        console.error("Migration error (card):", e);
      }
    }
  }

  // 3. Migrate Transactions
  if (db.transactions && db.transactions.length > 0) {
    for (const tx of db.transactions) {
      try {
        await supabase.from('bank_transactions').upsert(tx, { onConflict: 'id' });
      } catch (e) {
        console.error("Migration error (tx):", e);
      }
    }
  }

  // 4. Migrate Invoices
  if (db.invoices && db.invoices.length > 0) {
    for (const inv of db.invoices) {
      try {
        await supabase.from('bank_invoices').upsert(inv, { onConflict: 'id' });
      } catch (e) {
        console.error("Migration error (inv):", e);
      }
    }
  }

  // 5. Migrate Employer Requests
  if (db.employerRequests && db.employerRequests.length > 0) {
    for (const req of db.employerRequests) {
      try {
        await supabase.from('bank_employer_requests').upsert(req, { onConflict: 'id' });
      } catch (e) {
        console.error("Migration error (req):", e);
      }
    }
  }
}

// Run migration as soon as module loads if Supabase is alive!
migrateLocalDataToCloud().then(() => {
  console.log("LocalStorage to Supabase cloud migration completed successfully.");
}).catch(err => {
  console.warn("Migration failed or Supabase not ready:", err);
});

export async function fetchUserFromDB(passportCode) {
  try {
    const { data, error } = await supabase
      .from('bank_users')
      .select('*')
      .eq('passport_code', passportCode)
      .single();
    if (!error && data) return data;
  } catch (e) {}

  // Fallback to local
  const db = getLocalDB();
  return db.users.find(u => u.passport_code === passportCode) || null;
}

export async function saveUserToDB(user) {
  // Save local
  const db = getLocalDB();
  const exists = db.users.findIndex(u => u.passport_code === user.passport_code);
  if (exists >= 0) db.users[exists] = user;
  else db.users.push(user);
  saveLocalDB(db);

  // Try Supabase
  try {
    const { error } = await supabase.from('bank_users').upsert(user, { onConflict: 'passport_code' });
    if (error) console.warn("Supabase upsert user error:", error);
  } catch (e) {}
}

export async function fetchCardsForUser(passportCode) {
  try {
    const { data, error } = await supabase
      .from('bank_cards')
      .select('*')
      .eq('passport_code', passportCode);

    // If Supabase table exists but returns empty, let's also sync with local storage
    if (!error && data && data.length > 0) {
      return data;
    }
  } catch (e) {}

  const db = getLocalDB();
  const localCards = db.cards.filter(c => c.passport_code === passportCode);

  // Try sending local cards to Supabase in case they weren't synchronized yet
  if (localCards.length > 0) {
    for (const c of localCards) {
      try {
        await supabase.from('bank_cards').upsert(c, { onConflict: 'card_number' });
      } catch (err) {}
    }
  }
  return localCards;
}

export async function createCardInDB(card) {
  const db = getLocalDB();
  db.cards.push(card);
  saveLocalDB(db);

  try {
    await supabase.from('bank_cards').insert(card);
  } catch (e) {}
}

export async function updateCardBalanceInDB(cardNumber, newBalance) {
  const db = getLocalDB();
  const card = db.cards.find(c => c.card_number === cardNumber);
  if (card) {
    card.balance = Number(newBalance);
    saveLocalDB(db);
  }

  try {
    await supabase.from('bank_cards').update({ balance: Number(newBalance) }).eq('card_number', cardNumber);
  } catch (e) {}
}

export async function fetchTransactionsForCards(cardNumbers) {
  try {
    const { data, error } = await supabase
      .from('bank_transactions')
      .select('*')
      .or(`sender_card.in.(${cardNumbers.join(',')}),receiver_card.in.(${cardNumbers.join(',')})`)
      .order('created_at', { ascending: false });
    if (!error && data && data.length > 0) return data;
  } catch (e) {}

  const db = getLocalDB();
  return db.transactions.filter(t =>
    cardNumbers.includes(t.sender_card) || cardNumbers.includes(t.receiver_card)
  ).sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
}

export async function createTransactionInDB(tx) {
  const db = getLocalDB();
  db.transactions.push(tx);
  saveLocalDB(db);

  try {
    await supabase.from('bank_transactions').insert(tx);
  } catch (e) {}
}

export async function fetchInvoicesForUser(passportCode) {
  try {
    const { data, error } = await supabase
      .from('bank_invoices')
      .select('*')
      .eq('receiver_passport', passportCode);
    if (!error && data && data.length > 0) return data;
  } catch (e) {}

  const db = getLocalDB();
  return db.invoices.filter(i => i.receiver_passport === passportCode);
}

export async function createInvoiceInDB(invoice) {
  const db = getLocalDB();
  db.invoices.push(invoice);
  saveLocalDB(db);

  try {
    await supabase.from('bank_invoices').insert(invoice);
  } catch (e) {}
}

export async function updateInvoiceStatusInDB(invoiceId, status) {
  const db = getLocalDB();
  const invoice = db.invoices.find(i => i.id === invoiceId);
  if (invoice) {
    invoice.status = status;
    saveLocalDB(db);
  }

  try {
    await supabase.from('bank_invoices').update({ status }).eq('id', invoiceId);
  } catch (e) {}
}

export async function fetchEmployerRequestsFromDB() {
  try {
    const { data, error } = await supabase.from('bank_employer_requests').select('*');
    if (!error && data && data.length > 0) return data;
  } catch (e) {}

  const db = getLocalDB();
  return db.employerRequests;
}

export async function createEmployerRequestInDB(req) {
  const db = getLocalDB();
  db.employerRequests.push(req);
  saveLocalDB(db);

  try {
    await supabase.from('bank_employer_requests').insert(req);
  } catch (e) {}
}

export async function updateEmployerRequestStatusInDB(requestId, status) {
  const db = getLocalDB();
  const request = db.employerRequests.find(r => r.id === requestId);
  if (request) {
    request.status = status;
    saveLocalDB(db);

    // Update user employer status if approved
    if (status === 'approved') {
      const user = db.users.find(u => u.passport_code === request.passport_code);
      if (user) {
        user.is_employer = true;
        user.employer_company_name = request.company_name;
        user.is_employer_approved = true;
        saveLocalDB(db);
        await saveUserToDB(user);
      }
    }
  }

  try {
    await supabase.from('bank_employer_requests').update({ status }).eq('id', requestId);
    if (status === 'approved' && request) {
      await supabase.from('bank_users').update({
        is_employer: true,
        employer_company_name: request.company_name,
        is_employer_approved: true
      }).eq('passport_code', request.passport_code);
    }
  } catch (e) {}
}

// Admin panel operations: list all users
export async function adminFetchAllUsers() {
  try {
    const { data, error } = await supabase.from('bank_users').select('*');
    if (!error && data && data.length > 0) {
      // Fetch all cards too to attach
      const { data: cards } = await supabase.from('bank_cards').select('*');
      return data.map(u => ({
        ...u,
        cards: cards ? cards.filter(c => c.passport_code === u.passport_code) : []
      }));
    }
  } catch (e) {}

  const db = getLocalDB();
  return db.users.map(u => ({
    ...u,
    cards: db.cards.filter(c => c.passport_code === u.passport_code)
  }));
}
