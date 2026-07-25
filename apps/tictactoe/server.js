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
    if (board.every(cell => cell !== null)) {
        return 'draw';
    }
    return null;
}

function resetMatch() {
    gameState = {
        players: { X: null, O: null },
        scores: { X: 0, O: 0 },
        board: Array(9).fill(null),
        currentTurn: 'X',
        status: 'waiting',
        roundWinner: null,
        matchWinner: null
    };
    broadcastState();
}

function resetRound() {
    gameState.board = Array(9).fill(null);
    gameState.currentTurn = gameState.roundWinner === 'X' ? 'O' : 'X';
    gameState.roundWinner = null;
    gameState.status = (gameState.players.X && gameState.players.O) ? 'playing' : 'waiting';
    broadcastState();
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

socket.on('join', (client, payload) => {
    console.log(`[Tic-Tac-Toe] Join action from ${client.id}`, JSON.stringify(payload));
    const playerName = (payload && payload.name && payload.name.trim()) ? payload.name.trim() : `Player ${client.id.substring(0, 4)}`;
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
});

socket.on('move', (client, payload) => {
    if (gameState.status !== 'playing') return;

    const activePlayer = gameState.players[gameState.currentTurn];
    if (!activePlayer || activePlayer.id !== client.id) {
        console.log(`[Tic-Tac-Toe] Invalid move attempt by ${client.id} (not turn of ${gameState.currentTurn})`);
        return;
    }

    const index = payload ? payload.index : undefined;
    if (typeof index !== 'number' || index < 0 || index > 8 || gameState.board[index] !== null) return;

    const symbol = gameState.currentTurn;
    gameState.board[index] = symbol;

    const winner = checkWinner(gameState.board);
    if (winner) {
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
        gameState.currentTurn = gameState.currentTurn === 'X' ? 'O' : 'X';
    }
    broadcastState();
});

socket.on('next_round', () => {
    if (gameState.status === 'round_over') {
        resetRound();
    }
});

socket.on('reset_match', () => {
    resetMatch();
});
