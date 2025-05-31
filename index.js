const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const aplicativo = express();
const servidorHttp = http.createServer(aplicativo);
const servidorWs = new WebSocket.Server({ server: servidorHttp });

let turnoJogador = 'X';
let tabuleiro = Array(9).fill(null);
let listaJogadores = {};

aplicativo.use(express.static('public'));
aplicativo.use(express.urlencoded({ extended: true }));

aplicativo.get('/', (requisicao, resposta) => {
    resposta.sendFile(__dirname + '/index.html');
});

aplicativo.post('/usuario', (requisicao, resposta) => {
    const nome = requisicao.body['nome-str'];
    if (!nome) {
        return resposta.status(400).send('Nome é obrigatório');
    }
    resposta.redirect(`/jogo.html?nome=${encodeURIComponent(nome)}`);
});

servidorWs.on('connection', (conexao) => {
    if (Object.keys(listaJogadores).length >= 2) {
        conexao.close(1000, 'Máximo de jogadores atingido');
        return;
    }

    let idJogador;
    if (Object.keys(listaJogadores).length === 0) {
        idJogador = 'Jogador 1';
    } else {
        idJogador = 'Jogador 2';
    }

    listaJogadores[idJogador] = { conexao: conexao, nome: null };

    conexao.send(JSON.stringify({ acao: 'atribuirNome', nome: idJogador }));

    for (const [id, info] of Object.entries(listaJogadores)) {
        if (info.nome) {
            const chaveJogador = id === 'Jogador 1' ? 'p1' : 'p2';
            conexao.send(JSON.stringify({
                acao: 'atualizarNome',
                chaveJogador,
                nome: info.nome
            }));
        }
    }

    conexao.send(JSON.stringify({
        acao: 'estadoAtual',
        tabuleiro,
        turnoJogador
    }));

    conexao.on('message', (mensagem) => {
        const dados = JSON.parse(mensagem);

        if (dados.acao === 'alterarNome') {
            const chaveJogador = idJogador === 'Jogador 1' ? 'p1' : 'p2';
            listaJogadores[idJogador].nome = dados.nome;
            servidorWs.clients.forEach((cliente) => {
                if (cliente.readyState === WebSocket.OPEN) {
                    cliente.send(JSON.stringify({ acao: 'atualizarNome', chaveJogador, nome: dados.nome }));
                }
            });
        }

        if (dados.acao === 'reiniciar') {
            tabuleiro = Array(9).fill(null);
            turnoJogador = 'X';
            servidorWs.clients.forEach((cliente) => {
                if (cliente.readyState === WebSocket.OPEN) {
                    cliente.send(JSON.stringify({ acao: 'reiniciar' }));
                }
            });
        }

        if (dados.acao === 'sair') {
            const nome = listaJogadores[idJogador]?.nome;
            listaJogadores[idJogador].conexao.close();
            delete listaJogadores[idJogador];

            if (Object.keys(listaJogadores).length === 1) {
                turnoJogador = Object.keys(listaJogadores)[0] === 'Jogador 1' ? 'X' : 'O';
        }

        servidorWs.clients.forEach((cliente) => {
            if (cliente.readyState === WebSocket.OPEN) {
            cliente.send(JSON.stringify({
                acao: 'avisoJogadorSaiu',
                chaveJogador: nome,
                jogadorId: idJogador
            }));

            cliente.send(JSON.stringify({
                acao: 'atualizarTurno',
                turnoJogador: turnoJogador
            }));
        }
    });
}


        if (dados.indice !== undefined && dados.jogador !== undefined) {
            const indice = dados.indice;
            const jogador = dados.jogador;

            if (tabuleiro[indice] === null && jogador === turnoJogador) {
                tabuleiro[indice] = jogador;
                servidorWs.clients.forEach((cliente) => {
                    if (cliente.readyState === WebSocket.OPEN) {
                        cliente.send(JSON.stringify({ indice, jogador }));
                    }
                });
                turnoJogador = turnoJogador === 'X' ? 'O' : 'X';
            }
        }
    });

    conexao.on('close', () => {
        delete listaJogadores[idJogador];
        console.log(`${idJogador} desconectado`);
    });
});

servidorHttp.listen(8080, () => {
    console.log('Servidor está rodando em http://localhost:8080');
});
