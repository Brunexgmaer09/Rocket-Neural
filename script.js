// Constants
const CANVAS_WIDTH = 1920;
const CANVAS_HEIGHT = 1080;
const DRAG = 0.99;
const GRAVITY = 0.4;
const THRUST = 0.45;
const TARGET_ROTATION_SPEED = Math.PI / 180 * 2;
const ROTATION_ACCELERATION = Math.PI / 180 * 0.1;
const MAX_FIRE_ANGLE = Math.PI / 6;
const POPULATION_SIZE = 500;
const CENTER_MARGIN = 0.4;
const LIFESPAN = 500; // Number of frames for each generation

// Game state
let canvas, ctx, images, rockets, neat, generation, collectionTarget, currentFrame, bestFitness;

window.onload = function() {
    initializeGame();
    gameLoop();
};

function allRocketsInactive() {
    return rockets.every(rocket => !rocket.active);
}

function initializeGame() {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');
    
    images = {
        rocket: loadImage('foguete.png'),
        fire: loadImage('fire.png'),
        background: loadImage('fundo.png'),
        ship: loadImage('navio.png'),
        collection: loadImage('coleta.png')
    };

    // Initialize NEAT
    neat = new neataptic.Neat(
        11, // Number of input nodes (distance to target X, Y, rocket angle, rocket speed)
        3, // Number of output nodes (thrust, rotate left, rotate right)
        null,
        {
            mutation: neataptic.methods.mutation.ALL,
            popsize: POPULATION_SIZE,
            elitism: Math.round(0.1 * POPULATION_SIZE),
            network: new neataptic.architect.Perceptron(4, 10, 3)
        }
    );

    resetSimulation();
}

function resetSimulation() {
    generation = 0;
    currentFrame = 0;
    bestFitness = 0;
    collectionTarget = createCollectionTarget();
    rockets = createRockets();
}

function createRockets() {
    return neat.population.map((genome) => ({
        x: CANVAS_WIDTH / 2,
        y: CANVAS_HEIGHT - 300,
        speedX: 0,
        speedY: 0,
        angle: 0,
        fireAngle: 0,
        width: 450,
        height: 280,
        fitness: 0,
        brain: genome,
        thrusting: false,
        active: true,
        lifetime: 0  // Novo campo para contar o tempo de vida
    }));
}

function calculateFitness(rocket) {
    const rocketCenterX = rocket.x + rocket.width / 2;
    const rocketCenterY = rocket.y + rocket.height / 2;
    const collectCenterX = collectionTarget.x + collectionTarget.width / 2;
    const collectCenterY = collectionTarget.y + collectionTarget.height / 2;

    const distToColeta = Math.sqrt(
        Math.pow(collectCenterX - rocketCenterX, 2) +
        Math.pow(collectCenterY - rocketCenterY, 2)
    );

    // Fitness baseado na distância
    const distanceFitness = Math.max(0, 1000 * Math.exp(-distToColeta / 100));

    // Fitness baseado no tempo de vida
    const lifetimeFitness = rocket.lifetime * 0.1; // Ajuste este multiplicador conforme necessário

    // Combine os dois componentes do fitness
    const totalFitness = distanceFitness + lifetimeFitness;

    return totalFitness;
}

function updateRockets() {
    rockets.forEach(rocket => {
        if (!rocket.active) return;

        rocket.lifetime++;

        // Calculate and normalize inputs for the neural network
        const inputs = calculateNeuralInputs(rocket);

        // Get outputs from the neural network
        const outputs = rocket.brain.activate(inputs);

        // Apply controls based on network output
        applyNetworkOutputs(rocket, outputs);

        updatePosition(rocket);
        keepRocketInBounds(rocket);

        // Update fitness
        rocket.fitness = calculateFitness(rocket);
        rocket.brain.score = rocket.fitness;
        bestFitness = Math.max(bestFitness, rocket.fitness);

        // Check if rocket has reached the collection target
        if (checkCollision(rocket, collectionTarget)) {
            console.log("Rocket reached the collection target!");
            rocket.active = false;  // Deactivate the rocket
        }
    });
}

function checkCollision(rocket, target) {
    const rocketCenterX = rocket.x + rocket.width / 2;
    const rocketCenterY = rocket.y + rocket.height / 2;
    const targetCenterX = target.x + target.width / 2;
    const targetCenterY = target.y + target.height / 2;

    const distance = Math.sqrt(
        Math.pow(targetCenterX - rocketCenterX, 2) +
        Math.pow(targetCenterY - rocketCenterY, 2)
    );

    // Adjust this threshold as needed
    const collisionThreshold = (rocket.width + target.width) / 4;

    return distance < collisionThreshold;
}

function calculateNeuralInputs(rocket) {
    const rocketCenterX = rocket.x + rocket.width / 2;
    const rocketCenterY = rocket.y + rocket.height / 2;
    const targetCenterX = collectionTarget.x + collectionTarget.width / 2;
    const targetCenterY = collectionTarget.y + collectionTarget.height / 2;

    // Normalized distance to target (X and Y components)
    const distanceX = (targetCenterX - rocketCenterX) / CANVAS_WIDTH;
    const distanceY = (targetCenterY - rocketCenterY) / CANVAS_HEIGHT;

    // Normalized velocity
    const velocityX = rocket.speedX / 10; // Assume max speed is 10
    const velocityY = rocket.speedY / 10;

    // Normalized angle to target
    const angleToTarget = Math.atan2(targetCenterY - rocketCenterY, targetCenterX - rocketCenterX);
    const normalizedAngleToTarget = angleToTarget / (2 * Math.PI);

    // Normalized rocket angle
    const normalizedRocketAngle = (rocket.angle % (2 * Math.PI)) / (2 * Math.PI);

    // Difference between rocket angle and angle to target
    const angleDifference = normalizedAngleToTarget - normalizedRocketAngle;

    // Distance to nearest wall
    const distanceToLeftWall = rocket.x / CANVAS_WIDTH;
    const distanceToRightWall = (CANVAS_WIDTH - (rocket.x + rocket.width)) / CANVAS_WIDTH;
    const distanceToTopWall = rocket.y / CANVAS_HEIGHT;
    const distanceToBottomWall = (CANVAS_HEIGHT - (rocket.y + rocket.height)) / CANVAS_HEIGHT;

    return [
        distanceX,
        distanceY,
        velocityX,
        velocityY,
        normalizedAngleToTarget,
        normalizedRocketAngle,
        angleDifference,
        distanceToLeftWall,
        distanceToRightWall,
        distanceToTopWall,
        distanceToBottomWall
    ];
}

function applyNetworkOutputs(rocket, outputs) {
    rocket.thrusting = outputs[0] > 0.5;
    if (rocket.thrusting) {
        rocket.speedX += THRUST * Math.sin(rocket.angle);
        rocket.speedY -= THRUST * Math.cos(rocket.angle);
    }
    if (outputs[1] > 0.5) { // Rotate left
        rocket.angle -= TARGET_ROTATION_SPEED;
        rocket.fireAngle = Math.min(rocket.fireAngle + 0.1, MAX_FIRE_ANGLE);
    } else if (outputs[2] > 0.5) { // Rotate right
        rocket.angle += TARGET_ROTATION_SPEED;
        rocket.fireAngle = Math.max(rocket.fireAngle - 0.1, -MAX_FIRE_ANGLE);
    } else {
        rocket.fireAngle += (0 - rocket.fireAngle) * 0.1;
    }
}

function updatePosition(rocket) {
    rocket.speedX *= DRAG;
    rocket.speedY += GRAVITY;
    rocket.x += rocket.speedX;
    rocket.y += rocket.speedY;
}

function keepRocketInBounds(rocket) {
    if (rocket.x < 0 || rocket.x > CANVAS_WIDTH - rocket.width || 
        rocket.y < 0 || rocket.y > CANVAS_HEIGHT - rocket.height) {
        rocket.active = false;
        rocket.x = Math.max(0, Math.min(rocket.x, CANVAS_WIDTH - rocket.width));
        rocket.y = Math.max(0, Math.min(rocket.y, CANVAS_HEIGHT - rocket.height));
        rocket.speedX = 0;
        rocket.speedY = 0;
    }
}

function createCollectionTarget() {
    const minX = CANVAS_WIDTH * CENTER_MARGIN;
    const maxX = CANVAS_WIDTH * (1 - CENTER_MARGIN);
    const minY = CANVAS_HEIGHT * CENTER_MARGIN;
    const maxY = CANVAS_HEIGHT * (1 - CENTER_MARGIN);

    return {
        x: minX + Math.random() * (maxX - minX - 100),
        y: minY + Math.random() * (maxY - minY - 100),
        width: 100,
        height: 100
    };
}

function draw() {
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw background
    ctx.drawImage(images.background, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw ship
    ctx.drawImage(images.ship, CANVAS_WIDTH / 2 - 100, CANVAS_HEIGHT - 150, 200, 150);

    // Draw collection target
    ctx.drawImage(images.collection, collectionTarget.x, collectionTarget.y, collectionTarget.width, collectionTarget.height);

    // Draw rockets
    rockets.forEach(rocket => {
        ctx.save();
        ctx.translate(rocket.x + rocket.width / 2, rocket.y + rocket.height / 2);
        ctx.rotate(rocket.angle);

        // Desenha a chama primeiro (se o foguete estiver ativo e com propulsão)
        if (rocket.active && rocket.thrusting) {
            drawFire(rocket);
        }

        // Depois desenha o foguete
        drawRocket(rocket);

        ctx.restore();
    });

    // Draw information
    drawInfo();

    // Draw neural network
    drawNeuralNetwork(rockets[0].brain);
}

function drawFire(rocket) {
    ctx.save();
    ctx.translate(0, rocket.height / 7); // Move para a base do foguete
    ctx.rotate(rocket.fireAngle);
    const fireWidth = images.fire.width * 0.5;
    const fireHeight = images.fire.height * 0.5;
    
    if (!rocket.active) {
        ctx.globalAlpha = 0.3;
    }
    
    ctx.drawImage(images.fire, -fireWidth / 2, 0, fireWidth, fireHeight);
    ctx.globalAlpha = 1.0;
    ctx.restore();
}

function drawRocket(rocket) {
    if (rocket.active) {
        ctx.globalAlpha = 1.0;
    } else {
        ctx.globalAlpha = 0.3;
    }
    
    ctx.drawImage(images.rocket, -rocket.width / 2, -rocket.height / 2, rocket.width, rocket.height);
    
    ctx.globalAlpha = 1.0;
}

function drawInfo() {
    ctx.fillStyle = 'white';
    ctx.font = '20px Arial';
    ctx.fillText(`Generation: ${generation}`, 10, 30);
    ctx.fillText(`Frame: ${currentFrame}/${LIFESPAN}`, 10, 60);
    ctx.fillText(`Best Fitness (This Gen): ${bestFitness.toFixed(2)}`, 10, 90);
    
    // Adicione informações sobre o melhor tempo de vida
    const bestLifetime = Math.max(...rockets.map(r => r.lifetime));
    ctx.fillText(`Best Lifetime: ${bestLifetime}`, 10, 120);

    if (currentFrame >= LIFESPAN) {
        ctx.fillStyle = 'red';
        ctx.fillText('Generation ended: LIFESPAN reached', 10, 150);
    } else if (allRocketsInactive()) {
        ctx.fillStyle = 'red';
        ctx.fillText('Generation ended: All rockets inactive', 10, 150);
    }
}

function drawNeuralNetwork(network) {
    if (!network) {
        console.error('No network provided to drawNeuralNetwork');
        return;
    }

    const neuronPositions = calculateNeuronPositions(network);
    const layerCount = neuronPositions.length;

    // Draw connections
    ctx.strokeStyle = 'rgba(200, 200, 200, 0.5)';
    ctx.lineWidth = 1;
    network.connections.forEach(conn => {
        const fromLayer = conn.from.type === 'input' ? 0 : (conn.from.type === 'output' ? 2 : 1);
        const toLayer = conn.to.type === 'input' ? 0 : (conn.to.type === 'output' ? 2 : 1);
        const fromIndex = neuronPositions[fromLayer].findIndex(p => p.id === conn.from.id);
        const toIndex = neuronPositions[toLayer].findIndex(p => p.id === conn.to.id);
        
        if (fromIndex !== -1 && toIndex !== -1) {
            const start = neuronPositions[fromLayer][fromIndex];
            const end = neuronPositions[toLayer][toIndex];
            ctx.beginPath();
            ctx.moveTo(start.x, start.y);
            ctx.lineTo(end.x, end.y);
            ctx.stroke();
        }
    });

    // Draw neurons
    for (let layer = 0; layer < layerCount; layer++) {
        for (let neuron = 0; neuron < neuronPositions[layer].length; neuron++) {
            const {x, y} = neuronPositions[layer][neuron];
            ctx.beginPath();
            ctx.arc(x, y, 10, 0, 2 * Math.PI);
            ctx.fillStyle = layer === 0 ? 'blue' : layer === layerCount - 1 ? 'green' : 'white';
            ctx.fill();
            ctx.strokeStyle = 'black';
            ctx.stroke();
        }
    }
}

function calculateNeuronPositions(network) {
    if (!network || !network.nodes) {
        console.error('Invalid network structure:', network);
        return [];
    }

    const nodes = network.nodes;
    const inputNodes = nodes.filter(n => n.type === 'input');
    const outputNodes = nodes.filter(n => n.type === 'output');
    const hiddenNodes = nodes.filter(n => n.type === 'hidden');

    const layers = [
        inputNodes,
        hiddenNodes,
        outputNodes
    ];

    const layerCount = layers.length;
    const neuronPositions = [];

    const startX = CANVAS_WIDTH - 300;
    const startY = CANVAS_HEIGHT - 300;
    const width = 200;
    const height = 200;

    for (let i = 0; i < layerCount; i++) {
        const layerSize = layers[i].length;
        const positions = [];

        for (let j = 0; j < layerSize; j++) {
            positions.push({
                x: startX + (i / (layerCount - 1)) * width,
                y: startY + (j / (Math.max(layerSize - 1, 1))) * height
            });
        }

        neuronPositions.push(positions);
    }

    return neuronPositions;
}

function gameLoop() {
    if (currentFrame >= LIFESPAN || allRocketsInactive()) {
        console.log(`Generation ended. Reason: ${currentFrame >= LIFESPAN ? 'LIFESPAN reached' : 'All rockets inactive'}`);
        evolve();
    } else {
        updateRockets();
        draw();
        currentFrame++;
    }
    requestAnimationFrame(gameLoop);
}

function evolve() {
    // Sort rockets by fitness
    rockets.sort((a, b) => b.brain.score - a.brain.score);

    // Log the best fitness
    console.log(`Generation ${generation}: Best fitness = ${rockets[0].brain.score}`);

    // Evolve the population
    neat.sort();
    const newPopulation = [];

    // Elitism
    for (let i = 0; i < neat.elitism; i++) {
        newPopulation.push(neat.population[i]);
    }

    // Breed the rest
    for (let i = 0; i < neat.popsize - neat.elitism; i++) {
        newPopulation.push(neat.getOffspring());
    }

    // Replace the old population with the new population
    neat.population = newPopulation;
    neat.mutate();

    // Reset for next generation
    generation++;
    currentFrame = 0; // Reset the frame count
    bestFitness = 0;
    collectionTarget = createCollectionTarget();
    rockets = createRockets();
}

function loadImage(src) {
    const img = new Image();
    img.src = src;
    return img;
}