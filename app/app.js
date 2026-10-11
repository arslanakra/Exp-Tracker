// --- Initial State Definitions ---
const INITIAL_INCOME = 94500;
const BUDGET_CAP_GROCERIES = 23500;
const BUDGET_CAP_SAVINGS = 14100;

let state = {
    transactions: JSON.parse(localStorage.getItem('transactions')) || []
};

// --- DOM Cache Elements ---
const balanceEl = document.getElementById('total-balance');
const spentEl = document.getElementById('total-spent');
const savedEl = document.getElementById('total-saved');
const txForm = document.getElementById('transaction-form');
const txList = document.getElementById('transaction-list');
const smsInput = document.getElementById('sms-input');
const parseSmsBtn = document.getElementById('parse-sms-btn');

// --- Form Input DOM Cache ---
const inputDesc = document.getElementById('tx-description');
const inputAmount = document.getElementById('tx-amount');
const inputType = document.getElementById('tx-type');
const inputCategory = document.getElementById('tx-category');

function parseAmount(value) {
    const amountText = value.trim();
    if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(amountText)) {
        return null;
    }

    const amount = Number(amountText.replace(/,/g, ''));
    return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function formatAmount(amount) {
    return amount.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

inputAmount.addEventListener('input', () => {
    inputAmount.setCustomValidity('');
});

inputAmount.addEventListener('blur', () => {
    const amount = parseAmount(inputAmount.value);
    if (amount !== null) {
        inputAmount.value = formatAmount(amount);
    }
});

// --- Event Handling Bindings ---
txForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const amount = parseAmount(inputAmount.value);
    if (amount === null) {
        inputAmount.setCustomValidity('Enter an amount greater than zero, with optional commas and up to two decimal places.');
        inputAmount.reportValidity();
        return;
    }

    const newTx = {
        id: Date.now(),
        description: inputDesc.value,
        amount,
        type: inputType.value,
        category: inputCategory.value
    };
    state.transactions.push(newTx);
    saveAndRender();
    txForm.reset();
});

// ⚡ Regular Expression Engine for Bank SMS Processing
parseSmsBtn.addEventListener('click', () => {
    const text = smsInput.value.trim();
    if (!text) return alert("Please paste an SMS text message first.");

    const manualAmount = parseAmount(text);
    if (manualAmount !== null) {
        inputAmount.value = formatAmount(manualAmount);
        smsInput.value = "";
        return;
    }

    // Regular Expression patterns targeting PKR figures and vendor context structures
    const amountRegex = /(?:PKR|Rs\.?)\s*([0-9,]+(?:\.[0-9]+)?)/i;
    const debitRegex = /(?:debited|spent|paid to|withdrawn)/i;
    const groceryRegex = /(?:grocery|supermarket|mart|store|groceries)/i;

    const amountMatch = text.match(amountRegex);
    
    if (amountMatch) {
        // Clean comma notations from raw matches 
        const extractedAmount = parseFloat(amountMatch[1].replace(/,/g, ''));
        inputAmount.value = formatAmount(extractedAmount);

        // Auto-assign transaction nature classification profiles
        if (debitRegex.test(text)) {
            inputType.value = "expense";
            inputDesc.value = "SMS Auto Debit Expense";
            
            if (groceryRegex.test(text)) {
                inputCategory.value = "Groceries";
                inputDesc.value = "SMS Grocery Purchase";
            } else {
                inputCategory.value = "Miscellaneous";
            }
        } else {
            inputType.value = "savings"; // Defaults inflows as savings allocation updates
            inputCategory.value = "Savings";
            inputDesc.value = "SMS Auto Income Deposit";
        }
        smsInput.value = ""; // Clear parser workspace inputs upon successful parse
    } else {
        alert("Could not automatically parse financial numbers. Please verify text formatting pattern layout adjustments.");
    }
});

function saveAndRender() {
    localStorage.setItem('transactions', JSON.stringify(state.transactions));
    renderDashboard();
}

function renderDashboard() {
    txList.innerHTML = '';
    
    let totalSpent = 0;
    let totalSaved = 0;
    let grocerySpent = 0;

    // Calculate totals from transaction history
    state.transactions.forEach(tx => {
        if (tx.type === 'expense') {
            totalSpent += tx.amount;
            if (tx.category === 'Groceries') {
                grocerySpent += tx.amount;
            }
        } else if (tx.type === 'savings') {
            totalSaved += tx.amount;
        }

        // Build list item DOM
        const li = document.createElement('li');
        li.className = 'tx-item';
        li.setAttribute('data-testid', `tx-item-${tx.id}`);
        
        const isExpense = tx.type === 'expense';
        li.innerHTML = `
            <div class="details">
                <strong>${tx.description}</strong>
                <span class="tag">${tx.category}</span>
            </div>
            <span class="${isExpense ? 'tx-expense' : 'tx-income'}">
                ${isExpense ? '-' : '+'}${formatAmount(tx.amount)} PKR
            </span>
        `;
        txList.appendChild(li);
    });

    // Compute net balance pool states
    const dynamicNetBalance = INITIAL_INCOME - totalSpent - totalSaved;
    
    balanceEl.textContent = formatAmount(dynamicNetBalance);
    spentEl.textContent = formatAmount(totalSpent);
    savedEl.textContent = formatAmount(totalSaved);

    // --- Update Visual Alarm Configurations (Groceries) ---
    const groceryProgress = document.getElementById('grocery-progress');
    const groceryLabel = document.getElementById('grocery-spent-label');
    groceryLabel.textContent = `${formatAmount(grocerySpent)} / ${formatAmount(BUDGET_CAP_GROCERIES)} PKR`;
    
    const groceryPct = Math.min((grocerySpent / BUDGET_CAP_GROCERIES) * 100, 100);
    groceryProgress.style.width = `${groceryPct}%`;

    // Reset warning/alarm states dynamically
    groceryProgress.className = "progress-bar";
    if (groceryPct >= 100) {
        groceryProgress.classList.add('progress-alarm'); // Red alert status
    } else if (groceryPct >= 80) {
        groceryProgress.classList.add('progress-warning'); // Yellow alert status
    } else {
        groceryProgress.classList.add('progress-safe'); // Normal operational flow (Green)
    }

    // --- Update Savings Progress UI ---
    const savingsProgress = document.getElementById('savings-progress');
    const savingsLabel = document.getElementById('savings-spent-label');
    savingsLabel.textContent = `${formatAmount(totalSaved)} / ${formatAmount(BUDGET_CAP_SAVINGS)} PKR`;
    
    const savingsPct = Math.min((totalSaved / BUDGET_CAP_SAVINGS) * 100, 100);
    savingsProgress.style.width = `${savingsPct}%`;
    savingsProgress.classList.add('progress-savings');
}

// Initial execution trigger sequence 
renderDashboard();
