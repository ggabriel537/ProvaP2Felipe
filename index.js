const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let turno_jogador = 'X';
let tabuleiro = Array(9).fill(null);
let lista_jogadores = {
    'Jogador 1': { conexao: null, nome: 'Aguardando...', vitorias: 0, jogos: 0 },
    'Jogador 2': { conexao: null, nome: 'Aguardando...', vitorias: 0, jogos: 0 }
};

function verificarVencedor() {
    const combinacoes = [
        [0,1,2],[3,4,5],[6,7,8],
        [0,3,6],[1,4,7],[2,5,8],
        [0,4,8],[2,4,6]
    ];
    for (const [a, b, c] of combinacoes) {
        if (tabuleiro[a] && tabuleiro[a] === tabuleiro[b] && tabuleiro[a] === tabuleiro[c]) {
            return tabuleiro[a];
        }
    }
    return tabuleiro.every(c => c !== null) ? 'Empate' : null;
}

app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

app.post('/usuario', (req, res) => {
    const nome = req.body['nome-str'];
    if (!nome) return res.status(400).send('Nome é obrigatório');
    res.redirect(`/jogo.html?nome=${encodeURIComponent(nome)}`);
});

wss.on('connection', (conn) => {
    let id_jogador = null;

    for (const id in lista_jogadores) {
        if (!lista_jogadores[id].conexao) {
            id_jogador = id;
            lista_jogadores[id].conexao = conn;
            break;
        }
    }

    if (!id_jogador) {
        conn.close(1000, 'Máximo de jogadores atingido');
        return;
    }

    conn.send(JSON.stringify({ acao: 'atribuirNome', nome: id_jogador }));

    for (const id in lista_jogadores) {
        const chave_jogador = id === 'Jogador 1' ? 'p1' : 'p2';
        conn.send(JSON.stringify({ acao: 'atualizarNome', chaveJogador: chave_jogador, nome: lista_jogadores[id].nome }));
        conn.send(JSON.stringify({ acao: 'atualizarContadores', chaveJogador: chave_jogador, vitorias: lista_jogadores[id].vitorias, jogos: lista_jogadores[id].jogos }));
    }

    conn.send(JSON.stringify({ acao: 'estadoAtual', tabuleiro, turnoJogador: turno_jogador }));

    conn.on('message', (msg) => {
        const dados = JSON.parse(msg);

        if (dados.acao === 'alterarNome') {
            const chave_jogador = id_jogador === 'Jogador 1' ? 'p1' : 'p2';
            lista_jogadores[id_jogador].nome = dados.nome;
            wss.clients.forEach((cliente) => {
                if (cliente.readyState === WebSocket.OPEN) {
                    cliente.send(JSON.stringify({ acao: 'atualizarNome', chaveJogador: chave_jogador, nome: dados.nome }));
                }
            });
        }

        if (dados.acao === 'reiniciar') {
            tabuleiro = Array(9).fill(null);
            turno_jogador = 'X';
            wss.clients.forEach((cliente) => {
                if (cliente.readyState === WebSocket.OPEN) {
                    cliente.send(JSON.stringify({ acao: 'reiniciar' }));
                    cliente.send(JSON.stringify({ acao: 'atualizarTurno', turnoJogador: turno_jogador }));
                    cliente.send(JSON.stringify({ acao: 'ocultarBotao' }));
                }
            });
        }

        if (dados.acao === 'sair') {
            conn.close();
        }

        if (dados.indice !== undefined) {
            if (lista_jogadores[id_jogador]) {
                const simbolo = id_jogador === 'Jogador 1' ? 'X' : 'O';
                if (tabuleiro[dados.indice] === null && simbolo === turno_jogador) {
                    tabuleiro[dados.indice] = simbolo;
                    wss.clients.forEach((cliente) => {
                        if (cliente.readyState === WebSocket.OPEN) {
                            cliente.send(JSON.stringify({ indice: dados.indice, jogador: simbolo }));
                        }
                    });
                    const resultado = verificarVencedor();
                    if (resultado) {
                        const mensagem = resultado === 'Empate' ? 'Empate!' : `Jogador ${simbolo} venceu!`;
                        wss.clients.forEach((cliente) => {
                            if (cliente.readyState === WebSocket.OPEN) {
                                cliente.send(JSON.stringify({ acao: 'fimDeJogo', mensagem }));
                            }
                        });

                        if (resultado !== 'Empate') {
                            lista_jogadores[id_jogador].vitorias += 1;
                        }
                        lista_jogadores['Jogador 1'].jogos += 1;
                        lista_jogadores['Jogador 2'].jogos += 1;

                        wss.clients.forEach((cliente) => {
                            if (cliente.readyState === WebSocket.OPEN) {
                                wss.clients.forEach((cliente) => {
                                    if (cliente.readyState === WebSocket.OPEN) {
                                        cliente.send(JSON.stringify({ acao: 'atualizarContadores', chaveJogador: 'p1', vitorias: lista_jogadores['Jogador 1'].vitorias, jogos: lista_jogadores['Jogador 1'].jogos }));
                                        cliente.send(JSON.stringify({ acao: 'atualizarContadores', chaveJogador: 'p2', vitorias: lista_jogadores['Jogador 2'].vitorias, jogos: lista_jogadores['Jogador 2'].jogos }));
                                    }
                                });
                            }
                        });
                    } else {
                        turno_jogador = turno_jogador === 'X' ? 'O' : 'X';
                        wss.clients.forEach((cliente) => {
                            if (cliente.readyState === WebSocket.OPEN) {
                                cliente.send(JSON.stringify({ acao: 'atualizarTurno', turnoJogador: turno_jogador }));
                            }
                        });
                    }
                }
            }
        }
    });

    conn.on('close', () => {
        if (id_jogador) {
            lista_jogadores[id_jogador].conexao = null;
            lista_jogadores[id_jogador].nome = 'Aguardando...';
            lista_jogadores[id_jogador].vitorias = 0;
            lista_jogadores[id_jogador].jogos = 0;
            const chave_jogador = id_jogador === 'Jogador 1' ? 'p1' : 'p2';
            wss.clients.forEach((cliente) => {
                if (cliente.readyState === WebSocket.OPEN) {
                    cliente.send(JSON.stringify({ acao: 'atualizarNome', chaveJogador: chave_jogador, nome: 'Aguardando...' }));
                    cliente.send(JSON.stringify({ acao: 'avisoJogadorSaiu', chaveJogador: chave_jogador }));
                    if (id_jogador === 'Jogador 1' && lista_jogadores['Jogador 2'].conexao) {
                        cliente.send(JSON.stringify({ acao: 'passarVez', jogador: 'Jogador 2' }));
                        turno_jogador = 'O';
                    } else if (id_jogador === 'Jogador 2' && lista_jogadores['Jogador 1'].conexao) {
                        cliente.send(JSON.stringify({ acao: 'passarVez', jogador: 'Jogador 1' }));
                        turno_jogador = 'X';
                    }
                }
            });
            tabuleiro = Array(9).fill(null);
            wss.clients.forEach((cliente) => {
                if (cliente.readyState === WebSocket.OPEN) {
                    cliente.send(JSON.stringify({ acao: 'reiniciar' }));
                    cliente.send(JSON.stringify({ acao: 'atualizarTurno', turnoJogador: turno_jogador }));
                }
            });
        }
    });
});

server.listen(8080, () => {
    console.log('Servidor está rodando em http://localhost:8080');
});
