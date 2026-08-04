import socket from 'midl/socket';

const WINNING_COMBOS = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
];

let gameState = {
    players: { X: null, O: null },
    scores: { X: 0, O: 0 },
    board: Array(9).fill(null),
    moves: { X: [], O: [] },
    currentTurn: 'X',
    status: 'waiting',
    roundWinner: null,
    matchWinner: null
};

function broadcastState() {
    socket.to('tictactoe').broadcast({
        type: 'state_update',
        state: gameState
    });
}

function checkWinner(board) {
    for (const combo of WINNING_COMBOS) {
        const [a, b, c] = combo;
        if (board[a] && board[a] === board[b] && board[a] === board[c]) {
            return board[a];
        }
    }
    return null;
}

function resetMatch() {
    gameState = {
        players: { X: null, O: null },
        scores: { X: 0, O: 0 },
        board: Array(9).fill(null),
        moves: { X: [], O: [] },
        currentTurn: 'X',
        status: 'waiting',
        roundWinner: null,
        matchWinner: null
    };
    broadcastState();
}

function resetRound() {
    gameState.board = Array(9).fill(null);
    gameState.moves = { X: [], O: [] };
    gameState.currentTurn = gameState.roundWinner === 'X' ? 'O' : 'X';
    gameState.roundWinner = null;
    gameState.status = (gameState.players.X && gameState.players.O) ? 'playing' : 'waiting';
    broadcastState();
}

function isPlayer(clientId) {
    return (gameState.players.X && gameState.players.X.id === clientId) ||
           (gameState.players.O && gameState.players.O.id === clientId);
}

function handleJoin(client, payload) {
    console.log(`[Tic-Tac-Toe] Join action from ${client.id}`, JSON.stringify(payload));
    let playerName = `Player ${client.id.substring(0, 4)}`;
    if (payload && typeof payload.name === 'string' && payload.name.trim()) {
        playerName = payload.name.trim().substring(0, 15);
    }
    let assignedSymbol = null;

    if (gameState.players.X && gameState.players.X.id === client.id) {
        assignedSymbol = 'X';
    } else if (gameState.players.O && gameState.players.O.id === client.id) {
        assignedSymbol = 'O';
    } else if (!gameState.players.X) {
        gameState.players.X = { id: client.id, name: playerName };
        assignedSymbol = 'X';
    } else if (!gameState.players.O) {
        gameState.players.O = { id: client.id, name: playerName };
        assignedSymbol = 'O';
    }

    if (assignedSymbol) {
        socket.send(client.id, {
            type: 'joined',
            symbol: assignedSymbol,
            name: playerName
        });
    }

    if (gameState.players.X && gameState.players.O) {
        if (gameState.status === 'waiting') {
            gameState.status = 'playing';
            gameState.currentTurn = 'X';
        }
    }
    broadcastState();
}

function handleMove(client, payload) {
    if (gameState.status !== 'playing') return;

    const activePlayer = gameState.players[gameState.currentTurn];
    if (!activePlayer || activePlayer.id !== client.id) {
        console.log(`[Tic-Tac-Toe] Invalid move attempt by ${client.id} (not turn of ${gameState.currentTurn})`);
        return;
    }

    const index = payload ? payload.index : undefined;
    if (typeof index !== 'number' || index < 0 || index > 8 || gameState.board[index] !== null) return;

    const symbol = gameState.currentTurn;

    if (!gameState.moves) {
        gameState.moves = { X: [], O: [] };
    }
    if (!gameState.moves[symbol]) {
        gameState.moves[symbol] = [];
    }

    // Place the new mark
    gameState.board[index] = symbol;

    // Check if this move completes a winning line BEFORE removing the oldest mark
    const winner = checkWinner(gameState.board);
    if (winner && winner !== 'draw') {
        gameState.moves[symbol].push(index);
        gameState.roundWinner = winner;
        if (winner === 'X' || winner === 'O') {
            gameState.scores[winner] += 1;
            if (gameState.scores[winner] >= 3) {
                gameState.status = 'match_over';
                gameState.matchWinner = winner;
                broadcastState();
                return;
            }
        }
        gameState.status = 'round_over';
    } else {
        // If no win, remove the oldest mark if player already has 3 marks
        if (gameState.moves[symbol].length >= 3) {
            const oldestIndex = gameState.moves[symbol].shift();
            gameState.board[oldestIndex] = null;
        }
        gameState.moves[symbol].push(index);
        gameState.currentTurn = gameState.currentTurn === 'X' ? 'O' : 'X';
    }
    broadcastState();
}

function handleNextRound(client) {
    if (gameState.status === 'round_over' && isPlayer(client.id)) {
        resetRound();
    }
}

function handleResetMatch(client) {
    if (isPlayer(client.id)) {
        resetMatch();
    }
}

socket.on('connect', (client) => {
    console.log(`[Tic-Tac-Toe] Client connected: ${client.id}`);
    socket.join(client.id, 'tictactoe');
    socket.send(client.id, {
        type: 'init',
        clientId: client.id,
        state: gameState
    });
});

socket.on('disconnect', (client) => {
    console.log(`[Tic-Tac-Toe] Client disconnected: ${client.id}`);
    let playerLeft = false;
    if (gameState.players.X && gameState.players.X.id === client.id) {
        gameState.players.X = null;
        playerLeft = true;
    }
    if (gameState.players.O && gameState.players.O.id === client.id) {
        gameState.players.O = null;
        playerLeft = true;
    }

    if (playerLeft) {
        resetMatch();
    }
});

socket.on('join', (client, payload) => handleJoin(client, payload));
socket.on('move', (client, payload) => handleMove(client, payload));
socket.on('next_round', (client) => handleNextRound(client));
socket.on('reset_match', (client) => handleResetMatch(client));

socket.on('message', (client, message) => {
    let data = message;
    if (typeof message === 'string') {
        try {
            data = JSON.parse(message);
        } catch (e) {
            return;
        }
    }
    if (!data || typeof data !== 'object') return;
    const action = data.action;
    if (action === 'join') handleJoin(client, data);
    else if (action === 'move') handleMove(client, data);
    else if (action === 'next_round') handleNextRound(client);
    else if (action === 'reset_match') handleResetMatch(client);
});
