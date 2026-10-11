// --- Initial State Definitions ---
const DEFAULT_BUDGET_SETTINGS = {
    startingBalance: 94000
};
const savedBudgetSettings = JSON.parse(localStorage.getItem('budgetSettings') || 'null') || {};

let state = {
    transactions: JSON.parse(localStorage.getItem('transactions')) || [],
    budgetSettings: {
        startingBalance: getValidSetting(savedBudgetSettings.startingBalance, DEFAULT_BUDGET_SETTINGS.startingBalance),
        categoryTargets: {}
    }
};

// --- DOM Cache Elements ---
const balanceEl = document.getElementById('total-balance');
const spentEl = document.getElementById('total-spent');
const savedEl = document.getElementById('total-saved');
const txForm = document.getElementById('transaction-form');
const transactionInput = document.getElementById('tx-input');

// --- Dual Rendering Target Lists ---
const recentTxListList = document.getElementById('recent-transaction-list');
const fullTxListList = document.getElementById('full-transaction-list');
const dateFromInput = document.getElementById('tx-date-from');
const dateToInput = document.getElementById('tx-date-to');
const clearDateFilterBtn = document.getElementById('clear-date-filter-btn');
const dateFilterMessage = document.getElementById('date-filter-message');
const budgetSettingsForm = document.getElementById('budget-settings-form');
const startingBalanceInput = document.getElementById('starting-balance-input');
const categoryBudgetFields = document.getElementById('category-budget-fields');
const budgetSettingsMessage = document.getElementById('budget-settings-message');

// --- Form Input DOM Cache ---
const inputType = document.getElementById('tx-type');
const inputCategory = document.getElementById('tx-category');
let editingTransactionId = null;
const transactionCategories = Array.from(inputCategory.options, option => ({
    value: option.value,
    label: getCategoryTitle(option.value)
}));
const savedCategoryTargets = savedBudgetSettings.categoryTargets || {};

transactionCategories.forEach(category => {
    const legacyTarget = category.value === 'Groceries'
        ? savedBudgetSettings.groceriesTarget ?? 23500
        : category.value === 'Savings'
            ? savedBudgetSettings.savingsTarget ?? 14100
            : 0;
    state.budgetSettings.categoryTargets[category.value] = getValidSetting(
        savedCategoryTargets[category.value],
        getValidSetting(legacyTarget, 0)
    );
});

renderCategoryBudgetInputs();

// --- 📱 Navbar Navigation Routing Logic ---
const homeBtn = document.getElementById('nav-home-btn');
const txBtn = document.getElementById('nav-tx-btn');
const homeView = document.getElementById('dashboard-view');
const txView = document.getElementById('transactions-view');
const budgetBtn = document.getElementById('nav-budget-btn');
const budgetView = document.getElementById('budget-view');

homeBtn.addEventListener('click', () => {
    switchView(homeView, homeBtn);
});

txBtn.addEventListener('click', () => {
    switchView(txView, txBtn);
});

budgetBtn.addEventListener('click', () => {
    switchView(budgetView, budgetBtn);
});

function switchView(targetView, targetBtn) {
    // Remove active statuses globally across tab components
    document.querySelectorAll('.view-panel').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active-tab'));
    
    // Add active properties selectively to chosen panels
    targetView.classList.add('active');
    targetBtn.classList.add('active-tab');
}

function getValidSetting(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function formatBudgetSettingInput(input, value) {
    input.value = value.toLocaleString('en-US', { maximumFractionDigits: 2 });
    input.addEventListener('input', () => {
        input.setCustomValidity('');
        formatGroupedAmountInput(input);
    });
}

function renderCategoryBudgetInputs() {
    categoryBudgetFields.replaceChildren();
    transactionCategories.forEach(category => {
        const label = document.createElement('label');
        label.textContent = `${category.label} target (PKR)`;

        const input = document.createElement('input');
        input.type = 'text';
        input.inputMode = 'decimal';
        input.required = true;
        input.dataset.budgetCategory = category.value;
        input.setAttribute('aria-label', `${category.label} target in PKR`);
        formatBudgetSettingInput(input, state.budgetSettings.categoryTargets[category.value]);
        label.appendChild(input);
        categoryBudgetFields.appendChild(label);
    });
}

formatBudgetSettingInput(startingBalanceInput, state.budgetSettings.startingBalance);

budgetSettingsForm.addEventListener('submit', event => {
    event.preventDefault();
    const targetInputs = Array.from(categoryBudgetFields.querySelectorAll('[data-budget-category]'));
    const inputs = [startingBalanceInput, ...targetInputs];
    const values = inputs.map(input => parseNonNegativeAmount(input.value));
    const invalidInputIndex = values.findIndex(value => value === null);
    if (invalidInputIndex !== -1) {
        const input = inputs[invalidInputIndex];
        input.setCustomValidity('Enter a valid amount using digits and optional thousands separators.');
        input.reportValidity();
        budgetSettingsMessage.textContent = '';
        return;
    }

    inputs.forEach(input => input.setCustomValidity(''));
    state.budgetSettings = {
        startingBalance: values[0],
        categoryTargets: Object.fromEntries(targetInputs.map((input, index) => [
            input.dataset.budgetCategory,
            values[index + 1]
        ]))
    };
    localStorage.setItem('budgetSettings', JSON.stringify(state.budgetSettings));
    budgetSettingsMessage.textContent = 'Balance and targets saved.';
    renderDashboard();
});

// --- Manual Submission Interceptor Event ---
txForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const parsedAmount = parseTransactionAmount(transactionInput.value);
    if (parsedAmount === null) {
        transactionInput.setCustomValidity('Enter an amount or paste an SMS containing a PKR/Rs amount.');
        transactionInput.reportValidity();
        return;
    }

    const transaction = {
        id: Date.now(),
        date: getLocalDateString(new Date()),
        amount: parsedAmount,
        type: inputType.value,
        category: inputCategory.value
    };
    state.transactions.push(transaction);
    saveAndRender();
    txForm.reset();
});

function editTransaction(id) {
    const transaction = state.transactions.find(tx => tx.id === id);
    if (!transaction) return;

    editingTransactionId = transaction.id;
    renderDashboard();
}

function deleteTransaction(id) {
    const transaction = state.transactions.find(tx => tx.id === id);
    if (!transaction || !confirm(`Delete "${getCategoryTitle(transaction.category)}" transaction?`)) return;

    state.transactions = state.transactions.filter(tx => tx.id !== id);
    if (editingTransactionId === id) editingTransactionId = null;
    saveAndRender();
}

function handleTransactionAction(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) return;

    const id = Number(button.dataset.transactionId);
    if (button.dataset.action === 'edit') {
        editTransaction(id);
    } else if (button.dataset.action === 'delete') {
        deleteTransaction(id);
    } else if (button.dataset.action === 'cancel-edit') {
        editingTransactionId = null;
        renderDashboard();
    }
}

function handleInlineEditSubmit(event) {
    const form = event.target.closest('.tx-inline-form');
    if (!form) return;

    event.preventDefault();
    const id = Number(form.dataset.transactionId);
    const existingTransaction = state.transactions.find(tx => tx.id === id);
    if (!existingTransaction) return;

    const dateInput = form.elements.date;
    const date = parseDisplayDate(dateInput.value);
    if (!date) {
        dateInput.setCustomValidity('Enter a valid date as DD/MM/YYYY.');
        dateInput.reportValidity();
        return;
    }

    const amountInput = form.elements.amount;
    const amount = parseTransactionAmount(amountInput.value);
    if (amount === null) {
        amountInput.setCustomValidity('Enter a valid amount greater than zero.');
        amountInput.reportValidity();
        return;
    }

    state.transactions = state.transactions.map(tx => tx.id === id ? {
        ...tx,
        date,
        amount,
        type: form.elements.type.value,
        category: form.elements.category.value
    } : tx);
    editingTransactionId = null;
    saveAndRender();
}

recentTxListList.addEventListener('click', handleTransactionAction);
fullTxListList.addEventListener('click', handleTransactionAction);
recentTxListList.addEventListener('submit', handleInlineEditSubmit);
fullTxListList.addEventListener('submit', handleInlineEditSubmit);
dateFromInput.addEventListener('change', renderDashboard);
dateToInput.addEventListener('change', renderDashboard);
clearDateFilterBtn.addEventListener('click', () => {
    dateFromInput.value = '';
    dateToInput.value = '';
    renderDashboard();
});

function parseTransactionAmount(value) {
    const text = value.trim();
    const currencyMatch = text.match(/(?:PKR|Rs\.?)\s*([0-9,]+(?:\.[0-9]+)?)/i);
    const labeledAmountMatch = text.match(/\bamount(?:\s+of)?\s*[:\-]?\s*([0-9,]+(?:\.[0-9]+)?)/i);
    const plainAmountMatch = text.match(/^([0-9,]+(?:\.[0-9]+)?)$/);
    const amountMatch = currencyMatch || labeledAmountMatch || plainAmountMatch;
    if (!amountMatch) return null;

    const valueToParse = amountMatch[1];
    if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(valueToParse)) return null;

    const amount = parseFloat(valueToParse.replace(/,/g, ''));
    return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function parseNonNegativeAmount(value) {
    const text = value.trim();
    if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(text)) return null;
    const amount = Number(text.replace(/,/g, ''));
    return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function formatGroupedAmountInput(input) {
    const value = input.value;
    if (!/^[\d,]+(?:\.\d*)?$/.test(value)) return;

    const cursor = input.selectionStart;
    const textBeforeCursor = value.slice(0, cursor);
    const digitsBeforeCursor = (textBeforeCursor.match(/\d/g) || []).length;
    const decimalBeforeCursor = textBeforeCursor.includes('.');
    const [integerPart, decimalPart] = value.split('.');
    const groupedInteger = integerPart.replace(/,/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const formatted = value.includes('.') ? `${groupedInteger}.${decimalPart}` : groupedInteger;
    if (formatted === value) return;

    input.value = formatted;
    if (decimalBeforeCursor) {
        input.setSelectionRange(groupedInteger.length + 1 + textBeforeCursor.split('.')[1].length,
            groupedInteger.length + 1 + textBeforeCursor.split('.')[1].length);
        return;
    }

    let newCursor = 0;
    let digitsSeen = 0;
    while (newCursor < groupedInteger.length && digitsSeen < digitsBeforeCursor) {
        if (/\d/.test(groupedInteger[newCursor])) digitsSeen++;
        newCursor++;
    }
    input.setSelectionRange(newCursor, newCursor);
}

// Accept a plain amount or a bank SMS in the same required field.
transactionInput.addEventListener('input', () => {
    transactionInput.setCustomValidity('');
    formatGroupedAmountInput(transactionInput);
    const text = transactionInput.value.trim();
    const currencyMatch = text.match(/(?:PKR|Rs\.?)\s*([0-9,]+(?:\.[0-9]+)?)/i);
    const amountOnly = /^(?:(?:PKR|Rs\.?)\s*)?[0-9,]+(?:\.[0-9]+)?$/i.test(text);
    if (!currencyMatch || amountOnly) return;

    const debitRegex = /(?:debited|spent|paid to|withdrawn)/i;
    const groceryRegex = /(?:grocery|supermarket|mart|store|groceries)/i;

    if (debitRegex.test(text)) {
        inputType.value = 'expense';
        if (groceryRegex.test(text)) {
            inputCategory.value = 'Groceries';
        } else {
            inputCategory.value = 'Withdrawal';
        }
    } else {
        inputType.value = 'savings';
        inputCategory.value = 'Savings';
    }
});

function saveAndRender() {
    localStorage.setItem('transactions', JSON.stringify(state.transactions));
    renderDashboard();
}

function createTxRow(tx) {
    const li = document.createElement('li');
    li.className = 'tx-item';
    li.setAttribute('data-testid', `tx-item-${tx.id}`);

    if (editingTransactionId === tx.id) {
        li.classList.add('is-editing');
        li.appendChild(createInlineEditor(tx));
        return li;
    }
    
    const isExpense = tx.type === 'expense';
    const details = document.createElement('div');
    details.className = 'details';
    const summary = document.createElement('div');
    summary.className = 'tx-title-row';
    const title = document.createElement('strong');
    title.textContent = getCategoryTitle(tx.category);
    const amount = document.createElement('span');
    amount.className = isExpense ? 'tx-expense' : 'tx-income';
    amount.textContent = `${isExpense ? '-' : '+'}${tx.amount.toLocaleString()} PKR`;
    summary.append(title, amount);

    const category = document.createElement('span');
    category.className = 'tag';
    category.textContent = formatDisplayDate(getTransactionDate(tx)) || 'Date unknown';
    details.append(summary, category);

    const actions = document.createElement('div');
    actions.className = 'tx-actions';
    [['edit', 'Edit'], ['delete', 'Delete']].forEach(([action, label]) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `tx-action tx-action-${action}`;
        button.dataset.action = action;
        button.dataset.transactionId = tx.id;
        button.setAttribute('aria-label', `${label} ${getCategoryTitle(tx.category)} transaction`);
        button.title = `${label} transaction`;
        button.textContent = action === 'edit' ? '✏️' : '🗑️';
        actions.appendChild(button);
    });

    li.append(details, actions);
    return li;
}

function getCategoryTitle(category) {
    const titles = {
        Transport: 'Daily Expense',
        Restaurants: 'Restaurants & Dining',
        Utilities: 'Bills & Utilities',
        Groceries: 'Groceries',
        Lifestyle: 'Shopping & Lifestyle',
        Withdrawal: 'Cash Withdrawal',
        Savings: 'Savings Pot'
    };
    return titles[category] || category;
}

function getLocalDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatDisplayDate(isoDate) {
    const match = typeof isoDate === 'string' && isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
}

function parseDisplayDate(value) {
    const match = typeof value === 'string' && value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) return '';

    const [, day, month, year] = match;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    if (date.getFullYear() !== Number(year) ||
        date.getMonth() !== Number(month) - 1 ||
        date.getDate() !== Number(day)) {
        return '';
    }

    return `${year}-${month}-${day}`;
}

function getTransactionDate(tx) {
    if (typeof tx.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(tx.date)) {
        return tx.date;
    }

    const timestamp = Number(tx.id);
    const date = new Date(timestamp);
    return Number.isFinite(timestamp) && !Number.isNaN(date.getTime())
        ? getLocalDateString(date)
        : '';
}

function createInlineEditor(tx) {
    const form = document.createElement('form');
    form.className = 'tx-inline-form';
    form.dataset.transactionId = tx.id;

    const amount = document.createElement('input');
    amount.name = 'amount';
    amount.type = 'text';
    amount.inputMode = 'decimal';
    amount.value = tx.amount.toLocaleString('en-US', { maximumFractionDigits: 2 });
    amount.required = true;
    amount.setAttribute('aria-label', 'Amount in PKR');
    amount.addEventListener('input', () => {
        amount.setCustomValidity('');
        formatGroupedAmountInput(amount);
    });

    const date = document.createElement('input');
    date.name = 'date';
    date.type = 'text';
    date.value = formatDisplayDate(getTransactionDate(tx));
    date.placeholder = 'DD/MM/YYYY';
    date.inputMode = 'numeric';
    date.required = true;
    date.pattern = '\\d{2}/\\d{2}/\\d{4}';
    date.setAttribute('aria-label', 'Transaction date (DD/MM/YYYY)');
    date.addEventListener('input', () => date.setCustomValidity(''));

    const type = document.createElement('select');
    type.name = 'type';
    type.setAttribute('aria-label', 'Transaction type');
    [['expense', 'Expense'], ['savings', 'Savings Deposit']].forEach(([value, label]) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        type.appendChild(option);
    });
    type.value = tx.type;

    const category = document.createElement('select');
    category.name = 'category';
    category.setAttribute('aria-label', 'Transaction category');
    transactionCategories.forEach(({ value, label }) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        category.appendChild(option);
    });
    category.value = tx.category;

    const fields = document.createElement('div');
    fields.className = 'tx-inline-fields';
    fields.append(amount, type, category, date);

    const actions = document.createElement('div');
    actions.className = 'tx-inline-actions';

    const saveButton = document.createElement('button');
    saveButton.type = 'submit';
    saveButton.textContent = 'Save';

    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.dataset.action = 'cancel-edit';
    cancelButton.dataset.transactionId = tx.id;
    cancelButton.textContent = 'Cancel';

    actions.append(saveButton, cancelButton);
    form.append(fields, actions);
    return form;
}

function renderDashboard() {
    // Flush out older contents from lists completely
    recentTxListList.innerHTML = '';
    fullTxListList.innerHTML = '';
    
    let totalSpent = 0;
    let totalSaved = 0;
    const categoryTotals = Object.fromEntries(transactionCategories.map(category => [category.value, 0]));
    const fromDate = dateFromInput.value.trim() ? parseDisplayDate(dateFromInput.value) : '';
    const toDate = dateToInput.value.trim() ? parseDisplayDate(dateToInput.value) : '';
    const invalidDateFormat = (dateFromInput.value.trim() && !fromDate) ||
        (dateToInput.value.trim() && !toDate);
    const invalidDateRange = !invalidDateFormat && fromDate && toDate && fromDate > toDate;

    // Process general calculations across records array
    state.transactions.forEach(tx => {
        if (tx.type === 'expense') {
            totalSpent += tx.amount;
        } else if (tx.type === 'savings') {
            totalSaved += tx.amount;
        }
        if (Object.hasOwn(categoryTotals, tx.category)) {
            categoryTotals[tx.category] += tx.amount;
        }
        
    });

    const filteredTransactions = invalidDateFormat || invalidDateRange ? [] : state.transactions.filter(tx => {
        const date = getTransactionDate(tx);
        return (!fromDate && !toDate) || (
            date && (!fromDate || date >= fromDate) && (!toDate || date <= toDate)
        );
    });
    filteredTransactions.forEach(tx => fullTxListList.appendChild(createTxRow(tx)));

    if (invalidDateFormat) {
        dateFilterMessage.textContent = 'Enter dates as DD/MM/YYYY.';
        dateFilterMessage.hidden = false;
    } else if (invalidDateRange) {
        dateFilterMessage.textContent = 'The start date must be on or before the end date.';
        dateFilterMessage.hidden = false;
    } else if (filteredTransactions.length === 0) {
        dateFilterMessage.textContent = state.transactions.length
            ? 'No transactions found for the selected dates.'
            : 'No transactions yet.';
        dateFilterMessage.hidden = false;
    } else {
        dateFilterMessage.textContent = '';
        dateFilterMessage.hidden = true;
    }

    // ✂️ Truncate and parse only the LAST 3 transactions added for the dynamic home dashboard view panel
    // We reverse it so the newest entry sits clearly at the very top of the feed list
    const reversedHistory = [...state.transactions].reverse();
    const truncatedRecent = reversedHistory.slice(0, 3);
    
    truncatedRecent.forEach(tx => {
        recentTxListList.appendChild(createTxRow(tx));
    });

    // Compute net balance statuses
    const dynamicNetBalance = state.budgetSettings.startingBalance - totalSpent - totalSaved;
    
    balanceEl.textContent = dynamicNetBalance.toLocaleString();
    spentEl.textContent = totalSpent.toLocaleString();
    savedEl.textContent = totalSaved.toLocaleString();

    renderCategoryBudgetProgress(categoryTotals);
}

function renderCategoryBudgetProgress(categoryTotals) {
    const chartContainer = document.getElementById('budget-chart');
    chartContainer.replaceChildren();
    const visibleCategories = transactionCategories.filter(category =>
        (state.budgetSettings.categoryTargets[category.value] || 0) > 0 ||
        (categoryTotals[category.value] || 0) > 0
    );
    if (visibleCategories.length === 0) {
        const emptyMessage = document.createElement('p');
        emptyMessage.className = 'budget-chart-empty';
        emptyMessage.textContent = 'Set a category target in the Budget tab to see it here.';
        chartContainer.appendChild(emptyMessage);
        return;
    }

    const maxValue = Math.max(0, ...visibleCategories.flatMap(category => [
        state.budgetSettings.categoryTargets[category.value] || 0,
        categoryTotals[category.value] || 0
    ]), 1);
    chartContainer.setAttribute('aria-label', 'Spent and target amounts by category');

    visibleCategories.forEach(category => {
        const spent = categoryTotals[category.value] || 0;
        const target = state.budgetSettings.categoryTargets[category.value] || 0;
        const row = document.createElement('div');
        row.className = 'budget-chart-row';
        row.dataset.testid = `budget-chart-${category.value.toLowerCase()}`;
        row.setAttribute('aria-label',
            `${category.label}: ${spent.toLocaleString()} PKR spent, ${target.toLocaleString()} PKR target`);

        const heading = document.createElement('div');
        heading.className = 'budget-chart-heading';
        const name = document.createElement('span');
        name.className = 'budget-chart-category';
        name.textContent = category.label;
        const amounts = document.createElement('span');
        amounts.className = 'budget-chart-amounts';
        amounts.textContent = `${spent.toLocaleString()} / ${target.toLocaleString()} PKR`;
        heading.append(name, amounts);

        const track = document.createElement('div');
        track.className = 'budget-chart-track';
        track.setAttribute('aria-hidden', 'true');

        const targetBar = document.createElement('div');
        targetBar.className = 'budget-chart-target';
        targetBar.style.width = `${Math.min((target / maxValue) * 100, 100)}%`;

        const spentBar = document.createElement('div');
        spentBar.className = 'budget-chart-spent';
        spentBar.style.width = `${Math.min((spent / maxValue) * 100, 100)}%`;
        track.append(targetBar, spentBar);
        row.append(heading, track);
        chartContainer.appendChild(row);
    });

    const legend = document.createElement('div');
    legend.className = 'budget-chart-legend';
    legend.innerHTML = '<span class="budget-chart-legend-target">Target</span><span class="budget-chart-legend-spent">Spent</span>';
    chartContainer.appendChild(legend);
}

// Initial execution trigger sequence 
renderDashboard();
