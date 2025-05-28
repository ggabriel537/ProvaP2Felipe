const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const servidor = http.createServer(app);
const wsServidor = new WebSocket.Server({ server: servidor });

let jogadorAtual = 'X';
let estadoTabuleiro = Array(9).fill(null);
let jogadores = {};

wsServidor.on('connection', (conexao) => {
    const jogadorId = Object.keys(jogadores).length === 0 ? 'Jogador 1' : 'Jogador 2';
    jogadores[jogadorId] = conexao;

    conexao.send(JSON.stringify({ action: 'atribuirNome', nome: jogadorId }));

    conexao.on('message', (mensagem) => {
        const dados = JSON.parse(mensagem);

        if (dados.action === 'alterarNome') {
            const jogadorKey = jogadorId === 'Jogador 1' ? 'p1' : 'p2';
            wsServidor.clients.forEach((cliente) => {
                if (cliente.readyState === WebSocket.OPEN) {
                    cliente.send(JSON.stringify({ action: 'atualizarNome', jogadorKey, nome: dados.nome }));
                }
            });
        }
    });

    conexao.on('close', () => {
        delete jogadores[jogadorId];
        console.log(`${jogadorId} desconectado`);
    });
});
wsServidor.on('connection', (conexao) => {
    if (Object.keys(jogadores).length >= 2) {
        conexao.close(1000, 'Máximo de jogadores atingido');
        return;
    }

    const jogadorId = Object.keys(jogadores).length === 0 ? 'Jogador 1' : 'Jogador 2';
    jogadores[jogadorId] = conexao;

    conexao.send(JSON.stringify({ action: 'atribuirNome', nome: jogadorId }));

    conexao.on('close', () => {
        delete jogadores[jogadorId];
        console.log(`${jogadorId} desconectado`);
    });
});

wsServidor.on('connection', (conexao) => {
    conexao.on('message', (mensagem) => {
        const dados = JSON.parse(mensagem);

        if (dados.action === 'reiniciar') {
            estadoTabuleiro = Array(9).fill(null);
            jogadorAtual = 'X';

            wsServidor.clients.forEach((cliente) => {
                if (cliente.readyState === WebSocket.OPEN) {
                    cliente.send(JSON.stringify({ action: 'reiniciar' }));
                }
            });
        }
    });
});

wsServidor.on('connection', (conexao) => {
    console.log('Novo cliente conectado');

    conexao.on('message', (mensagem) => {
        const dados = JSON.parse(mensagem);
        const { indice, jogador } = dados;

        if (estadoTabuleiro[indice] === null) {
            estadoTabuleiro[indice] = jogador;

            // Enviar jogada para todos os clientes
            wsServidor.clients.forEach((cliente) => {
                if (cliente.readyState === WebSocket.OPEN) {
                    cliente.send(JSON.stringify({ indice, jogador }));
                }
            });

            // Alternar para o próximo jogador
            jogadorAtual = jogadorAtual === 'X' ? 'O' : 'X';
        }
    });

    conexao.on('close', () => {
        console.log('Cliente desconectado');
    });
});

app.use(express.static('public'));

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

servidor.listen(8080, () => {
    console.log('Servidor está rodando em http://localhost:8080');
});