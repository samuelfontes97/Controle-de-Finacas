document.addEventListener('DOMContentLoaded', () => {
    
    // --- CONFIGURAÇÃO DA API, CATEGORIAS E AUTENTICAÇÃO ---
    const API_BASE_URL = 'http://localhost:3000/api';

    const CATEGORIES = {
        income: ["Salário", "Freelance", "Investimentos", "Presente", "Outros"],
        expense: ["Moradia", "Alimentação", "Transporte", "Lazer", "Saúde", "Educação", "Contas", "Outros"]
    };

    const saveAuthData = ({ token, user }) => {
        localStorage.setItem('authToken', token);
        localStorage.setItem('user', JSON.stringify(user));
    };
    const getAuthToken = () => localStorage.getItem('authToken');
    const getUserData = () => JSON.parse(localStorage.getItem('user'));
    const clearAuthData = () => {
        localStorage.removeItem('authToken');
        localStorage.removeItem('user');
    };

    const apiFetch = async (endpoint, options = {}) => {
        const token = getAuthToken();
        const headers = { 'Content-Type': 'application/json', ...options.headers };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        
        try {
            const response = await fetch(`${API_BASE_URL}${endpoint}`, { ...options, headers });

            if (response.status === 401) {
                clearAuthData();
                showToast('Sua sessão expirou. Por favor, faça login novamente.', 'error');
                setTimeout(() => window.location.href = 'index.html', 2000);
                throw new Error('Não autorizado');
            }

            const responseData = response.status === 204 ? null : await response.json();

            if (!response.ok) {
                const errorMessage = responseData?.message || 'Ocorreu um erro na requisição.';
                throw new Error(errorMessage);
            }
            
            return responseData;
        } catch (error) {
            if (error instanceof TypeError) {
                throw new Error('Não foi possível conectar ao servidor. Verifique se ele está rodando.');
            }
            throw error;
        }
    };

    // --- FUNÇÕES UTILITÁRIAS ---
    const formatCurrency = (value) => {
        if (typeof value !== 'number') {
            value = parseFloat(value) || 0;
        }
        return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    };

    const formatDate = (dateString) => {
        if (!dateString) return 'Data inválida';
        return new Date(dateString).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
    };

    // --- ROTEAMENTO E INICIALIZAÇÃO ---
    const pageBody = document.body;
    if (!pageBody.classList.contains('login-page') && !getAuthToken()) {
        window.location.href = 'index.html';
    }

    const initMap = {
        'login-page': initAuthPage,
        'dashboard-page': initDashboardPage,
        'page-metas': initMetasPage,
        'page-receitas': () => initTransactionPage('income'),
        'page-gastos': () => initTransactionPage('expense')
    };

    const pageClass = Array.from(pageBody.classList).find(cls => initMap[cls]);
    if (pageClass) {
        initMap[pageClass]();
    }

    // --- PÁGINA DE LOGIN E CADASTRO ---
    function initAuthPage() {
        const form = document.getElementById('auth-form');
        const nameField = document.getElementById('name-field');
        const usernameInput = document.getElementById('username');
        const formTitle = document.getElementById('form-title');
        const formSubtitle = document.getElementById('form-subtitle');
        const submitBtnText = document.getElementById('submit-btn-text');
        const toggleLink = document.getElementById('toggle-link');
        const button = form.querySelector('button[type="submit"]');
        let isLoginMode = true;

        const toggleMode = () => {
            isLoginMode = !isLoginMode;
            nameField.classList.toggle('hidden', isLoginMode);
            usernameInput.required = !isLoginMode;
            formTitle.textContent = isLoginMode ? 'Bem-vindo(a)' : 'Crie sua Conta';
            formSubtitle.textContent = isLoginMode ? 'Acesse seu painel financeiro' : 'É rápido e fácil!';
            submitBtnText.textContent = isLoginMode ? 'Entrar' : 'Cadastrar';
            toggleLink.textContent = isLoginMode ? 'Não tem uma conta? Cadastre-se' : 'Já tem uma conta? Faça login';
            form.reset();
        };

        toggleLink.addEventListener('click', (e) => { e.preventDefault(); toggleMode(); });

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!validateForm(form.id)) return;
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const endpoint = isLoginMode ? '/auth/login' : '/auth/register';
            const body = { email, password };
            if (!isLoginMode) {
                body.name = usernameInput.value;
            }

            toggleLoading(button, true);
            try {
                const data = await apiFetch(endpoint, { method: 'POST', body: JSON.stringify(body) });
                saveAuthData(data);
                showToast(data.message);
                setTimeout(() => window.location.href = 'dashboard.html', 1000);
            } catch (error) {
                showToast(error.message, 'error');
            } finally {
                toggleLoading(button, false);
            }
        });
    }

    // --- PÁGINA DO DASHBOARD ---
    async function initDashboardPage() {
        const userData = getUserData();
        if (!userData) return;
        document.getElementById('dashboard-title').textContent = `⚓ Painel de ${userData.name}`;
        try {
            const transactions = await apiFetch('/transactions');
            updateSummary(transactions);
            renderBarChart(transactions);
            renderCategoryChart(transactions);
        } catch (error) {
            showToast(error.message, 'error');
        }
        document.getElementById('logout-btn')?.addEventListener('click', () => {
            showToast('Até logo!', 'success');
            setTimeout(() => {
                clearAuthData();
                window.location.href = 'index.html';
            }, 1000);
        });
        document.getElementById('export-csv-btn')?.addEventListener('click', async () => {
            try {
                const transactions = await apiFetch('/transactions');
                exportToCSV(transactions);
            } catch (error) {
                showToast(error.message, 'error');
            }
        });
    }

    function updateSummary(transactions) {
        if (!transactions) return;
        const income = transactions.filter(t => t.type === 'income').reduce((acc, t) => acc + parseFloat(t.amount), 0);
        const expenses = transactions.filter(t => t.type === 'expense').reduce((acc, t) => acc + parseFloat(t.amount), 0);
        const balance = income - expenses;
        document.getElementById('total-balance').textContent = formatCurrency(balance);
        document.getElementById('total-income').textContent = formatCurrency(income);
        document.getElementById('total-expenses').textContent = formatCurrency(expenses);
        document.title = `${formatCurrency(balance)} - Painel de ${getUserData().name}`;
    }

    function renderBarChart(transactions) {
        const ctx = document.getElementById('financial-chart')?.getContext('2d');
        if (!ctx || !transactions) return;
        const monthlyData = processDataForBarChart(transactions);
        if (window.financialChart) window.financialChart.destroy();
        Chart.defaults.color = 'rgba(240, 240, 245, 0.8)';
        window.financialChart = new Chart(ctx, { type: 'bar', data: { labels: monthlyData.labels, datasets: [{ label: 'Receitas', data: monthlyData.incomeData, backgroundColor: 'rgba(42, 157, 143, 0.7)' }, { label: 'Gastos', data: monthlyData.expensesData, backgroundColor: 'rgba(231, 111, 81, 0.7)' }] }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } } });
    }

    function processDataForBarChart(transactions) {
        const data = {};
        const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
        transactions.forEach(t => { const date = new Date(t.date); const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth()).padStart(2, '0')}`; if (!data[key]) data[key] = { label: `${monthNames[date.getUTCMonth()]}/${date.getUTCFullYear()}`, income: 0, expense: 0 }; data[key][t.type] += parseFloat(t.amount); });
        const sortedKeys = Object.keys(data).sort();
        return { labels: sortedKeys.map(key => data[key].label), incomeData: sortedKeys.map(key => data[key].income), expensesData: sortedKeys.map(key => data[key].expense), };
    }

    function renderCategoryChart(transactions) {
        const ctx = document.getElementById('category-chart')?.getContext('2d');
        if (!ctx || !transactions) return;
        const expenseData = processDataForCategoryChart(transactions);
        if (window.categoryChart) window.categoryChart.destroy();
        window.categoryChart = new Chart(ctx, { type: 'doughnut', data: { labels: expenseData.labels, datasets: [{ data: expenseData.data, backgroundColor: ['#8338ec', '#c71f66', '#fca311', '#2a9d8f', '#118ab2', '#e76f51', '#f78c6b', '#264653'], borderColor: 'rgba(58, 58, 90, 0.5)' }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } } } });
    }

    function processDataForCategoryChart(transactions) {
        const expenseByCategory = {};
        transactions.filter(t => t.type === 'expense').forEach(t => { expenseByCategory[t.category] = (expenseByCategory[t.category] || 0) + parseFloat(t.amount); });
        return { labels: Object.keys(expenseByCategory), data: Object.values(expenseByCategory) };
    }

    // --- PÁGINA DE METAS ---
    async function initMetasPage() {
        await renderGoals();
        const form = document.getElementById('goal-form');
        const button = form?.querySelector('button[type="submit"]');
        form?.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (validateForm(form.id)) {
                const description = form.querySelector('#goal-description').value;
                const amount = parseFloat(form.querySelector('#goal-amount').value);
                toggleLoading(button, true);
                try {
                    await addGoal(description, amount);
                    form.reset();
                } catch (error) {
                    showToast(error.message, 'error');
                } finally {
                    toggleLoading(button, false);
                }
            }
        });
    }

    async function addGoal(description, amount) {
        await apiFetch('/goals', { method: 'POST', body: JSON.stringify({ description, amount }) });
        await renderGoals();
        showToast('Meta adicionada com sucesso!');
    }

    async function deleteGoal(id) {
        showConfirmation('Tem certeza que deseja excluir esta meta?', async () => {
            try {
                await apiFetch(`/goals/${id}`, { method: 'DELETE' });
                await renderGoals();
                showToast('Meta excluída.', 'error');
            } catch (error) {
                showToast(error.message, 'error');
            }
        });
    }

    async function renderGoals() {
        try {
            const [transactions, goals] = await Promise.all([apiFetch('/transactions'), apiFetch('/goals')]);
            const goalsList = document.getElementById('goals-list');
            goalsList.innerHTML = '';
            const balance = transactions.filter(t => t.type === 'income').reduce((acc, t) => acc + parseFloat(t.amount), 0) - transactions.filter(t => t.type === 'expense').reduce((acc, t) => acc + parseFloat(t.amount), 0);
            if (goals.length === 0) {
                goalsList.innerHTML = '<p class="empty-state">Você ainda não tem nenhuma meta.</p>';
                return;
            }
            goals.forEach(goal => {
                const progress = Math.max(0, Math.min((balance / parseFloat(goal.amount)) * 100, 100));
                const goalCard = document.createElement('div');
                goalCard.className = 'goal-card';
                goalCard.innerHTML = `<div class="goal-header"><h4>${goal.description}</h4><button class="delete-btn" title="Excluir Meta">🗑️</button></div><div class="goal-details"><span>${formatCurrency(balance > 0 ? balance : 0)} / ${formatCurrency(parseFloat(goal.amount))}</span><span>${progress.toFixed(1)}%</span></div><div class="progress-bar"><div class="progress-bar-fill" style="width: ${progress}%">${progress.toFixed(0)}%</div></div>`;
                goalCard.querySelector('.delete-btn').addEventListener('click', () => deleteGoal(goal.id));
                goalsList.appendChild(goalCard);
            });
        } catch (error) {
            showToast(error.message, 'error');
        }
    }

    // --- PÁGINA DE TRANSAÇÕES ---
    async function initTransactionPage(type) {
        document.getElementById('date').valueAsDate = new Date();
        populateCategorySelects(type);
        setupEventListeners(type);
        await renderTransactionList(type);
    }

    function populateCategorySelects(type) {
        const categories = CATEGORIES[type];
        document.querySelectorAll('#category, #filter-category, #edit-category').forEach(select => {
            if (!select) return;
            const currentValue = select.value;
            let firstOption = '';
            if (select.id === 'filter-category') {
                firstOption = '<option value="all">Todas</option>';
            } else {
                firstOption = '<option value="">Selecione...</option>';
            }
            select.innerHTML = firstOption;
            categories.forEach(cat => {
                select.innerHTML += `<option value="${cat}">${cat}</option>`;
            });
            select.value = currentValue;
        });
    }

    function setupEventListeners(type) {
        const form = document.getElementById('transaction-form');
        const button = form?.querySelector('button[type="submit"]');
        form?.addEventListener('submit', (e) => { e.preventDefault(); if (validateForm(form.id)) addTransaction(type, button); });
        document.getElementById('filter-category')?.addEventListener('change', () => renderTransactionList(type));
        document.getElementById('filter-month')?.addEventListener('input', () => renderTransactionList(type));
        document.getElementById('clear-filters-btn')?.addEventListener('click', () => { document.getElementById('filter-category').value = 'all'; document.getElementById('filter-month').value = ''; renderTransactionList(type); });
        const editForm = document.getElementById('edit-form');
        const editButton = editForm?.querySelector('button[type="submit"]');
        editForm?.addEventListener('submit', (e) => { e.preventDefault(); if (validateForm(editForm.id)) saveEditedTransaction(type, editButton); });
        document.getElementById('cancel-edit-btn')?.addEventListener('click', closeEditModal);
    }

    async function renderTransactionList(type, newTransactionId = null) {
        try {
            const transactions = await apiFetch('/transactions');
            const listElement = document.getElementById('transaction-list');
            listElement.innerHTML = '';
            const filterCategory = document.getElementById('filter-category').value;
            const filterMonthYear = document.getElementById('filter-month').value;
            const filtered = transactions
                .filter(t => t.type === type && (!filterMonthYear || t.date.startsWith(filterMonthYear)) && (filterCategory === 'all' || t.category === filterCategory))
                .sort((a, b) => new Date(b.date) - new Date(a.date));

            if (filtered.length === 0) {
                listElement.innerHTML = `<tr><td colspan="5" style="text-align:center;">Nenhuma transação encontrada.</td></tr>`;
                return;
            }

            filtered.forEach(t => {
                const row = document.createElement('tr');
                row.dataset.id = t.id;
                row.innerHTML = `<td>${t.description}</td><td>${formatCurrency(t.amount)}</td><td>${t.category}</td><td>${formatDate(t.date)}</td><td class="action-buttons"><button class="edit-btn" title="Editar">✏️</button><button class="delete-btn" title="Excluir">🗑️</button></td>`;
                if (t.id === newTransactionId) {
                    row.classList.add('row-slide-in');
                    row.addEventListener('animationend', () => row.classList.remove('row-slide-in'));
                }
                row.querySelector('.edit-btn').addEventListener('click', () => openEditModal(t.id, type));
                row.querySelector('.delete-btn').addEventListener('click', () => deleteTransaction(t.id, type));
                listElement.appendChild(row);
            });
        } catch (error) {
            showToast(error.message, 'error');
        }
    }

    async function addTransaction(type, button) {
        toggleLoading(button, true);
        const transactionData = { description: document.getElementById('description').value, amount: parseFloat(document.getElementById('amount').value), date: document.getElementById('date').value, category: document.getElementById('category').value, type: type };
        try {
            const newTransaction = await apiFetch('/transactions', { method: 'POST', body: JSON.stringify(transactionData) });
            document.getElementById('transaction-form').reset();
            document.getElementById('date').valueAsDate = new Date();
            await renderTransactionList(type, newTransaction.id);
            showToast('Transação adicionada com sucesso!');
        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            toggleLoading(button, false);
        }
    }

    function deleteTransaction(id, type) {
        showConfirmation('Tem certeza que deseja excluir esta transação?', async () => {
            const row = document.querySelector(`tr[data-id='${id}']`);
            if (row) {
                row.classList.add('row-fade-out');
                try {
                    await apiFetch(`/transactions/${id}`, { method: 'DELETE' });
                    setTimeout(async () => {
                        await renderTransactionList(type);
                        showToast('Transação excluída.', 'error');
                    }, 400);
                } catch (error) {
                    showToast(error.message, 'error');
                    row.classList.remove('row-fade-out');
                }
            }
        });
    }

    async function openEditModal(id, type) {
        try {
            const transactions = await apiFetch('/transactions');
            const transaction = transactions.find(t => t.id == id);
            if (!transaction) { showToast('Transação não encontrada.', 'error'); return; }
            document.getElementById('edit-id').value = id;
            document.getElementById('edit-description').value = transaction.description;
            document.getElementById('edit-amount').value = parseFloat(transaction.amount);
            document.getElementById('edit-date').value = transaction.date.split('T')[0];
            const categorySelect = document.getElementById('edit-category');
            populateCategorySelects(type);
            categorySelect.value = transaction.category;
            document.getElementById('edit-modal').style.display = 'flex';
        } catch (error) { showToast(error.message, 'error'); }
    }

    function closeEditModal() { document.getElementById('edit-modal').style.display = 'none'; }

    async function saveEditedTransaction(type, button) {
        toggleLoading(button, true);
        const id = document.getElementById('edit-id').value;
        const transactionData = { description: document.getElementById('edit-description').value, amount: parseFloat(document.getElementById('edit-amount').value), date: document.getElementById('edit-date').value, category: document.getElementById('edit-category').value };
        try {
            await apiFetch(`/transactions/${id}`, { method: 'PUT', body: JSON.stringify(transactionData) });
            closeEditModal();
            await renderTransactionList(type);
            showToast('Transação salva com sucesso!');
        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            toggleLoading(button, false);
        }
    }

    // --- FUNÇÕES DE FEEDBACK VISUAL E UTILITÁRIOS ---
    function showToast(message, type = 'success') {
        const toastContainer = document.getElementById('toast-container');
        if (!toastContainer) return;
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.classList.add('fade-out');
            toast.addEventListener('animationend', () => toast.remove());
        }, 3000);
    }

    function toggleLoading(button, isLoading) {
        if (!button) return;
        if (isLoading) {
            button.disabled = true;
            button.classList.add('btn--loading');
        } else {
            button.disabled = false;
            button.classList.remove('btn--loading');
        }
    }

    function showConfirmation(message, onConfirm) {
        const modalContainer = document.getElementById('confirmation-modal');
        if (!modalContainer) return;
        modalContainer.style.display = 'flex';
        modalContainer.innerHTML = `<div class="modal-content"><h4>Confirmação</h4><p>${message}</p><div class="modal-actions"><button id="confirm-cancel" class="btn-secondary">Cancelar</button><button id="confirm-ok" class="btn btn-expense">Confirmar</button></div></div>`;
        document.getElementById('confirm-cancel').onclick = () => modalContainer.style.display = 'none';
        document.getElementById('confirm-ok').onclick = () => { onConfirm(); modalContainer.style.display = 'none'; };
    }

    function validateForm(formId) {
        let isValid = true;
        document.querySelectorAll(`#${formId} [required]`).forEach(input => {
            if (!input.value.trim()) isValid = false;
        });
        if (!isValid) showToast('Por favor, preencha todos os campos obrigatórios.', 'error');
        return isValid;
    }

    function exportToCSV(transactions) {
        if (!transactions || transactions.length === 0) { showToast('Nenhuma transação para exportar.', 'error'); return; }
        let csvContent = "data:text/csv;charset=utf-8,ID,Tipo,Descrição,Valor,Categoria,Data\n";
        transactions.forEach(t => { const description = t.description.includes(',') ? `"${t.description}"` : t.description; const row = [t.id, t.type, description, t.amount, t.category, t.date.split('T')[0]].join(","); csvContent += row + "\n"; });
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "controle_financeiro_export.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast('Dados exportados com sucesso!');
    }
});