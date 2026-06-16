const RATE = 3.75;
const STORAGE_KEY = "moneytrack.transactions.v1";
const CATEGORIES = {
  income: ["Salary", "Business", "Gift", "Other income"],
  expense: ["Food", "Transport", "Bills", "Shopping", "Health", "Education", "Other expense"]
};

const state = {
  transactions: loadTransactions(),
  displayCurrency: localStorage.getItem("moneytrack.currency") || "USD",
  deferredInstallPrompt: null
};

const els = {
  form: document.querySelector("#transaction-form"),
  amount: document.querySelector("#amount"),
  currency: document.querySelector("#currency"),
  category: document.querySelector("#category"),
  date: document.querySelector("#date"),
  note: document.querySelector("#note"),
  displayCurrency: document.querySelector("#display-currency"),
  balanceTotal: document.querySelector("#balance-total"),
  incomeTotal: document.querySelector("#income-total"),
  expenseTotal: document.querySelector("#expense-total"),
  monthTotal: document.querySelector("#month-total"),
  reportRange: document.querySelector("#report-range"),
  reportIncome: document.querySelector("#report-income"),
  reportExpense: document.querySelector("#report-expense"),
  reportNet: document.querySelector("#report-net"),
  categoryBars: document.querySelector("#category-bars"),
  transactionList: document.querySelector("#transaction-list"),
  emptyState: document.querySelector("#empty-state"),
  clearForm: document.querySelector("#clear-form"),
  clearAll: document.querySelector("#clear-all"),
  exportCsv: document.querySelector("#export-csv"),
  installButton: document.querySelector("#install-button")
};

function loadTransactions() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveTransactions() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.transactions));
}

function toUsd(amount, currency) {
  return currency === "SAR" ? amount / RATE : amount;
}

function fromUsd(amountUsd, currency = state.displayCurrency) {
  return currency === "SAR" ? amountUsd * RATE : amountUsd;
}

function money(amountUsd, currency = state.displayCurrency) {
  const amount = fromUsd(amountUsd, currency);
  const label = currency === "SAR" ? "SR" : "$";
  return currency === "SAR"
    ? `${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${label}`
    : `${label}${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function todayInputValue() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createId() {
  if (globalThis.crypto && globalThis.crypto.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function startOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function isInReportRange(dateText, range) {
  const now = startOfDay(new Date());
  const date = startOfDay(`${dateText}T00:00:00`);

  if (range === "daily") {
    return date.getTime() === now.getTime();
  }

  if (range === "weekly") {
    const day = now.getDay();
    const start = new Date(now);
    start.setDate(now.getDate() - day);
    return date >= start && date <= now;
  }

  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

function currentMonthTransactions() {
  return state.transactions.filter((item) => isInReportRange(item.date, "monthly"));
}

function totals(items = state.transactions) {
  return items.reduce(
    (acc, item) => {
      if (item.type === "income") acc.income += item.amountUsd;
      if (item.type === "expense") acc.expense += item.amountUsd;
      return acc;
    },
    { income: 0, expense: 0 }
  );
}

function updateCategories() {
  const type = new FormData(els.form).get("type");
  els.category.innerHTML = CATEGORIES[type]
    .map((category) => `<option value="${category}">${category}</option>`)
    .join("");
}

function renderSummary() {
  const all = totals();
  const month = totals(currentMonthTransactions());
  els.balanceTotal.textContent = money(all.income - all.expense);
  els.incomeTotal.textContent = money(all.income);
  els.expenseTotal.textContent = money(all.expense);
  els.monthTotal.textContent = money(month.income - month.expense);
}

function renderReport() {
  const range = els.reportRange.value;
  const items = state.transactions.filter((item) => isInReportRange(item.date, range));
  const report = totals(items);
  els.reportIncome.textContent = money(report.income);
  els.reportExpense.textContent = money(report.expense);
  els.reportNet.textContent = money(report.income - report.expense);

  const expensesByCategory = items
    .filter((item) => item.type === "expense")
    .reduce((acc, item) => {
      acc[item.category] = (acc[item.category] || 0) + item.amountUsd;
      return acc;
    }, {});

  const entries = Object.entries(expensesByCategory).sort((a, b) => b[1] - a[1]);
  const largest = Math.max(...entries.map((entry) => entry[1]), 1);

  els.categoryBars.innerHTML = entries.length
    ? entries
        .map(([category, amount]) => {
          const width = Math.max(8, Math.round((amount / largest) * 100));
          return `
            <div class="bar-row">
              <span>${category}</span>
              <div class="bar-track"><div class="bar-fill" style="width:${width}%"></div></div>
              <strong>${money(amount)}</strong>
            </div>
          `;
        })
        .join("")
    : '<p class="empty-state">No expenses in this report period.</p>';
}

function renderTransactions() {
  const sorted = [...state.transactions].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  els.emptyState.hidden = sorted.length > 0;
  els.transactionList.innerHTML = sorted
    .slice(0, 40)
    .map((item) => {
      const sign = item.type === "income" ? "+" : "-";
      const className = item.type === "income" ? "amount-income" : "amount-expense";
      const original = `${item.currency === "USD" ? "$" : ""}${item.amount.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })}${item.currency === "SAR" ? " SR" : ""}`;
      return `
        <article class="transaction-item">
          <div>
            <strong>${item.category}</strong>
            <span class="transaction-meta">${item.date} · ${item.note || "No note"} · entered as ${original}</span>
          </div>
          <div>
            <strong class="${className}">${sign}${money(item.amountUsd)}</strong>
            <button class="delete-button" type="button" data-id="${item.id}">Delete</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function render() {
  renderSummary();
  renderReport();
  renderTransactions();
}

function resetForm() {
  els.form.reset();
  els.date.value = todayInputValue();
  updateCategories();
  els.amount.focus();
}

function exportCsv() {
  const rows = [
    ["date", "type", "category", "note", "amount_entered", "currency_entered", "amount_usd", "amount_sar"],
    ...state.transactions.map((item) => [
      item.date,
      item.type,
      item.category,
      item.note,
      item.amount.toFixed(2),
      item.currency,
      item.amountUsd.toFixed(2),
      fromUsd(item.amountUsd, "SAR").toFixed(2)
    ])
  ];
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `moneytrack-${todayInputValue()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

els.form.addEventListener("change", (event) => {
  if (event.target.name === "type") updateCategories();
});

els.form.addEventListener("submit", (event) => {
  event.preventDefault();
  const type = new FormData(els.form).get("type");
  const amount = Number(els.amount.value);
  if (!amount || amount <= 0) return;

  state.transactions.push({
    id: createId(),
    type,
    amount,
    currency: els.currency.value,
    amountUsd: toUsd(amount, els.currency.value),
    category: els.category.value,
    date: els.date.value,
    note: els.note.value.trim(),
    createdAt: Date.now()
  });

  saveTransactions();
  resetForm();
  render();
});

els.displayCurrency.addEventListener("change", () => {
  state.displayCurrency = els.displayCurrency.value;
  localStorage.setItem("moneytrack.currency", state.displayCurrency);
  render();
});

els.reportRange.addEventListener("change", renderReport);
els.clearForm.addEventListener("click", resetForm);
els.exportCsv.addEventListener("click", exportCsv);

els.clearAll.addEventListener("click", () => {
  if (!state.transactions.length) return;
  if (confirm("Delete all transactions from this device?")) {
    state.transactions = [];
    saveTransactions();
    render();
  }
});

els.transactionList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-id]");
  if (!button) return;
  state.transactions = state.transactions.filter((item) => item.id !== button.dataset.id);
  saveTransactions();
  render();
});

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  state.deferredInstallPrompt = event;
  els.installButton.hidden = false;
});

els.installButton.addEventListener("click", async () => {
  if (!state.deferredInstallPrompt) return;
  state.deferredInstallPrompt.prompt();
  await state.deferredInstallPrompt.userChoice;
  state.deferredInstallPrompt = null;
  els.installButton.hidden = true;
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js");
  });
}

els.displayCurrency.value = state.displayCurrency;
els.date.value = todayInputValue();
updateCategories();
render();
