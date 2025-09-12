// Sample JavaScript file for testing
const gameConfig = {
  speed: 5,
  difficulty: 'medium',
  maxPlayers: 4
};

function draw() {
  console.log('Drawing frame');
  updatePositions();
  render();
}

function update() {
  // Update game state
  checkCollisions();
  updateScore();
}

class Blob {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.size = 50;
    this.color = 'red';
  }

  update() {
    this.x += (mouseX - this.x) * 0.05;
    this.y += (mouseY - this.y) * 0.05;
  }

  draw() {
    fill(this.color);
    ellipse(this.x, this.y, this.size);
  }
}

const blob1 = new Blob(100, 100);
const player = new Player();

export { gameConfig, draw, update, Blob };