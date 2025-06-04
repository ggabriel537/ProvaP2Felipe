const express = require('express');
const http = require('http');   //Dependencias do codigo
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app); 
const wss = new WebSocket.Server({ server });

let turno_jogador = 'X';
let tabuleiro = Array(9).fill(null); //Inicia o tabuleiro com 9 posições vazias (null) e com o turno do jogador X
let lista_jogadores = {
    'Jogador 1': { conexao: null, nome: 'Aguardando...', vitorias: 0, jogos: 0 }, //Preenche inicialmente os nomes dos jogadores como aguardando...
    'Jogador 2': { conexao: null, nome: 'Aguardando...', vitorias: 0, jogos: 0 }
};

function verificarVencedor() {
    const combinacoes = [ //Condicoes de Vitoria
    [0,1,2], //primeira linha
    [3,4,5], //segunda linha
    [6,7,8], //terceira linha
    [0,3,6], //primeira coluna
    [1,4,7], //segunda coluna
    [2,5,8], //terceira coluna
    [0,4,8], //diagonal \
    [2,4,6]  //diagonal /
];
    for (const [a, b, c] of combinacoes) {
        if (tabuleiro[a] && tabuleiro[a] === tabuleiro[b] && tabuleiro[a] === tabuleiro[c]) { //Confirma se os 3 indices possuem o mesmo valor, X ou O
            return tabuleiro[a]; //Confirma o vencedor
        }
    }
    return tabuleiro.every(c => c !== null) ? 'Empate' : null; //Verifica se todas as celulas estão preenchidas, se sim, retorna empate, se não, retorna null
}

app.use(express.static('public')); //Define a pasta public como a raiz para arquivos
app.use(express.urlencoded({ extended: true })); //Utilizar formularios HTML

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html'); //Envia o arquivo index.html quando o IP é acessado
});

app.post('/usuario', (req, res) => {
    const nome = req.body['nome-str']; //Recebe o nome do jogador pela pagina index.html
    if (!nome) return res.status(400).send('Nome é obrigatório');
    res.redirect(`/jogo.html?nome=${encodeURIComponent(nome)}`); //Envia a pagina jogo.html com o nome do jogador
});

wss.on('connection', (conn) => {
    let id_jogador = null;

    for (const id in lista_jogadores) { //Verifica se existe um jogador com a conexao vazia
        if (!lista_jogadores[id].conexao) {
            id_jogador = id;
            lista_jogadores[id].conexao = conn; //Adiciona o jogador a lista de jogadores
            break;
        }
    }

    if (!id_jogador) {
        conn.close(1000, 'Máximo de jogadores atingido'); //Se não houver espaço para mais jogadores, fecha a conexão
        return;
    }

    conn.send(JSON.stringify({ acao: 'atribuirNome', nome: id_jogador })); //Envia o nome do jogador que foi atribuído

    for (const id in lista_jogadores) {
        const chave_jogador = id === 'Jogador 1' ? 'p1' : 'p2';
        conn.send(JSON.stringify({ acao: 'atualizarNome', chaveJogador: chave_jogador, nome: lista_jogadores[id].nome })); //Envia o nome do jogador conectado para o outro jogador
        conn.send(JSON.stringify({ acao: 'atualizarContadores', chaveJogador: chave_jogador, vitorias: lista_jogadores[id].vitorias, jogos: lista_jogadores[id].jogos })); //Define os contadores de vitorias e jogos
    }

    conn.send(JSON.stringify({ acao: 'estadoAtual', tabuleiro, turnoJogador: turno_jogador })); //Envia o estado atual do jogo para o jogador

    conn.on('message', (msg) => {
        const dados = JSON.parse(msg);

        if (dados.acao === 'alterarNome') {
            const chave_jogador = id_jogador === 'Jogador 1' ? 'p1' : 'p2';
            lista_jogadores[id_jogador].nome = dados.nome; //Seta o nome do jogador na lista de jogadores
            wss.clients.forEach((cliente) => {
                if (cliente.readyState === WebSocket.OPEN) {
                    cliente.send(JSON.stringify({ acao: 'atualizarNome', chaveJogador: chave_jogador, nome: dados.nome })); //Atualiza o nome do jogador no HTML
                }
            });
        }

        if (dados.acao === 'reiniciar') {
            tabuleiro = Array(9).fill(null); //Preenche o tabuleiro novamente com 9 posições vazias (null)
            turno_jogador = 'X'; //Define o turno para o jogador X
            wss.clients.forEach((cliente) => {
                if (cliente.readyState === WebSocket.OPEN) { //Envia para o cliente que o jogo foi reiniciado
                    cliente.send(JSON.stringify({ acao: 'reiniciar' }));
                    cliente.send(JSON.stringify({ acao: 'atualizarTurno', turnoJogador: turno_jogador }));
                    cliente.send(JSON.stringify({ acao: 'ocultarBotao' }));
                }
            });
        }

        if (dados.acao === 'sair') {
            conn.close(); //Apenas roda o comando de fechar a conexão
        }

        if (dados.acao === 'alterarJogada' && dados.indice !== undefined) {
            if (lista_jogadores[id_jogador]) {
                const simbolo = id_jogador === 'Jogador 1' ? 'X' : 'O'; //Define o simbolo do jogador baseado no id_jogador
                if (tabuleiro[dados.indice] === null && simbolo === turno_jogador) {
                    tabuleiro[dados.indice] = simbolo;
                    wss.clients.forEach((cliente) => {
                        // Envia a jogada atualizada para todos os clientes conectados
                        if (cliente.readyState === WebSocket.OPEN) {
                            cliente.send(JSON.stringify({ indice: dados.indice, jogador: simbolo }));
                        }
                    });
                    const resultado = verificarVencedor(); //Verifica se há um vencedor ou empate
                    if (resultado) {
                        const vencedor = resultado === 'Empate' ? 'Empate' : lista_jogadores[id_jogador].nome; //Define o vencedor ou empate
                        wss.clients.forEach((cliente) => {
                            if (cliente.readyState === WebSocket.OPEN) {
                                cliente.send(JSON.stringify({ acao: 'fimDeJogo', nomeVencedor: vencedor })); //Envia o resultado do jogo
                            }
                        });

                        if (resultado !== 'Empate') {
                            lista_jogadores[id_jogador].vitorias += 1; //Incrementa as vitorias do jogador que venceu
                        }
                        lista_jogadores['Jogador 1'].jogos += 1; //Incrementa o contador de jogos
                        lista_jogadores['Jogador 2'].jogos += 1;

                        wss.clients.forEach((cliente) => {
                            if (cliente.readyState === WebSocket.OPEN) {
                                cliente.send(JSON.stringify({ acao: 'atualizarContadores', chaveJogador: 'p1', vitorias: lista_jogadores['Jogador 1'].vitorias, jogos: lista_jogadores['Jogador 1'].jogos }));
                                // Envia os contadores atualizados para ambos os jogadores
                                cliente.send(JSON.stringify({ acao: 'atualizarContadores', chaveJogador: 'p2', vitorias: lista_jogadores['Jogador 2'].vitorias, jogos: lista_jogadores['Jogador 2'].jogos }));
                            }
                        });
                    } else {
                        turno_jogador = turno_jogador === 'X' ? 'O' : 'X'; //Alterna o turno entre os jogadores
                        wss.clients.forEach((cliente) => {
                            if (cliente.readyState === WebSocket.OPEN) {
                                cliente.send(JSON.stringify({ acao: 'atualizarTurno', turnoJogador: turno_jogador })); //Envia o turno atualizado para os jogadores
                            }
                        });
                    }
                }
            }
        }
    });

    conn.on('close', () => {
        if (id_jogador) {
            const nomeAntigo = lista_jogadores[id_jogador].nome;
            const chave_jogador = id_jogador === 'Jogador 1' ? 'p1' : 'p2';
            // Notifica os outros jogadores que um jogador saiu
            wss.clients.forEach((cliente) => {
                if (cliente.readyState === WebSocket.OPEN) {
                    cliente.send(JSON.stringify({ acao: 'atualizarNome', chaveJogador: chave_jogador, nome: 'Aguardando...' })); //Atualiza o nome do jogador que saiu para "Aguardando..."
                    cliente.send(JSON.stringify({ acao: 'avisoJogadorSaiu', chaveJogador: chave_jogador, nomeJogador: nomeAntigo })); //Envia um aviso de que o jogador saiu
                    if (id_jogador === 'Jogador 1' && lista_jogadores['Jogador 2'].conexao) {
                        cliente.send(JSON.stringify({ acao: 'passarVez', jogador: 'Jogador 2' })); //Passa a vez para o Jogador 2 se o Jogador 1 sair
                        turno_jogador = 'O';
                    } else if (id_jogador === 'Jogador 2' && lista_jogadores['Jogador 1'].conexao) {
                        cliente.send(JSON.stringify({ acao: 'passarVez', jogador: 'Jogador 1' })); //Passa a vez para o Jogador 1 se o Jogador 2 sair
                        turno_jogador = 'X';
                    }
                }
            });
            // Reseta o estado do jogador que saiu
            lista_jogadores[id_jogador].conexao = null;
            lista_jogadores[id_jogador].nome = 'Aguardando...';
            lista_jogadores[id_jogador].vitorias = 0;
            lista_jogadores[id_jogador].jogos = 0;

            tabuleiro = Array(9).fill(null); //Reseta o tabuleiro
            wss.clients.forEach((cliente) => {
                // Envia o estado atualizado do jogo para todos os clientes
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
