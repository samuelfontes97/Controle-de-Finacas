// Importa as bibliotecas que instalamos
require('dotenv').config();
const express = require('express');
const cors = require('cors');

// Importa os arquivos de rotas
const authRoutes = require('./routes/auth');
const transactionRoutes = require('./routes/transactions'); // <<--- ADICIONE ESTA LINHA
const goalRoutes = require('./routes/goals');           // <<--- ADICIONE ESTA LINHA

// Inicializa o aplicativo Express
const app = express();

// Configura os middlewares
app.use(cors());
app.use(express.json());

// Rota de teste para verificar se o servidor está no ar
app.get('/', (req, res) => {
  res.json({ message: '🎉 Servidor do Controle Financeiro está no ar! 🎉' });
});

// Usa as rotas da API
app.use('/api/auth', authRoutes);
app.use('/api/transactions', transactionRoutes); // <<--- ADICIONE ESTA LINHA
app.use('/api/goals', goalRoutes);             // <<--- ADICIONE ESTA LINHA

// Define a porta onde o servidor vai rodar
const PORT = process.env.PORT || 3000;

// Inicia o servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});