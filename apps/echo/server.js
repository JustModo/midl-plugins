import socket from 'midl/socket';

socket.on('connect', (client) => {
    console.log(`[Echo Server] Client connected: ${client.id}`);
    socket.emitTo(client.id, 'connected', { clientId: client.id });
});

socket.on('disconnect', (client) => {
    console.log(`[Echo Server] Client disconnected: ${client.id}`);
});

// Handle custom 'echo' event if sent by client
socket.on('echo', (client, payload) => {
    console.log(`[Echo Server] Received 'echo' event from ${client.id}:`, JSON.stringify(payload));
    socket.emitTo(client.id, 'echo.response', payload);
});

// Handle generic raw messages
socket.on('message', (client, message) => {
    console.log(`[Echo Server] Received message from ${client.id}:`, JSON.stringify(message));
    // Echo the message back to the sender
    socket.send(client.id, message);
});
