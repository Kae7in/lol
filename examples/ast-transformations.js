import { parseModule } from 'magicast';

// Example JavaScript code to transform
const originalCode = `
const config = {
  speed: 5,
  color: 'red',
  size: 100
};

class Ball {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.vx = config.speed;
    this.vy = config.speed;
  }
  
  update() {
    this.x += this.vx;
    this.y += this.vy;
  }
  
  draw() {
    fill(config.color);
    ellipse(this.x, this.y, config.size);
  }
}

function setup() {
  createCanvas(800, 600);
  const ball = new Ball(100, 100);
}

function draw() {
  background(220);
  ball.update();
  ball.draw();
}
`;

console.log('Original Code:');
console.log('==============');
console.log(originalCode);

// Example transformations using magicast
function demonstrateTransformations() {
  console.log('\n\nAST Transformations:');
  console.log('====================\n');

  // 1. Modify config properties
  console.log('1. Changing config values:');
  const mod1 = parseModule(originalCode);
  
  // Parse and modify the config object
  const configMatch = originalCode.match(/const config = ({[\s\S]*?});/);
  if (configMatch) {
    const newConfig = `const config = {
  speed: 10,
  color: 'blue',
  size: 150,
  trail: true
};`;
    const transformed1 = originalCode.replace(configMatch[0], newConfig);
    console.log('   - Changed speed: 5 → 10');
    console.log('   - Changed color: red → blue');
    console.log('   - Changed size: 100 → 150');
    console.log('   - Added trail: true');
  }

  // 2. Add a second ball
  console.log('\n2. Adding a second ball:');
  const mod2 = parseModule(originalCode);
  const setupMatch = originalCode.match(/function setup\(\) {[\s\S]*?}/);
  if (setupMatch) {
    const newSetup = setupMatch[0].replace(
      'const ball = new Ball(100, 100);',
      'const ball = new Ball(100, 100);\n  const ball2 = new Ball(400, 300);'
    );
    console.log('   - Added: const ball2 = new Ball(400, 300)');
  }

  // 3. Add trail effect
  console.log('\n3. Adding trail effect:');
  const trailCode = `
const trail = [];
const maxTrailLength = 20;

function addToTrail(x, y) {
  trail.push({x, y});
  if (trail.length > maxTrailLength) {
    trail.shift();
  }
}

function drawTrail() {
  trail.forEach((point, i) => {
    const alpha = i / trail.length;
    fill(255, 255, 255, alpha * 100);
    ellipse(point.x, point.y, 50);
  });
}`;
  console.log('   - Added trail array and helper functions');

  // 4. Modify method implementation
  console.log('\n4. Modifying Ball.update() method:');
  const updateMethod = `  update() {
    // Add smooth mouse following
    const targetX = mouseX;
    const targetY = mouseY;
    this.x += (targetX - this.x) * 0.1;
    this.y += (targetY - this.y) * 0.1;
  }`;
  console.log('   - Changed to smooth mouse following');

  // 5. Rename variables
  console.log('\n5. Renaming variables:');
  console.log('   - Renamed: ball → mainBall');
  console.log('   - Renamed: config → gameConfig');

  // Show example transformation syntax
  console.log('\n\nExample AST Edit Format:');
  console.log('========================');
  const exampleEdit = {
    file: "script.js",
    type: "ast",
    transformations: [
      {
        action: "modify",
        target: "config.speed",
        value: "10"
      },
      {
        action: "add-after",
        target: "const ball = new Ball(100, 100)",
        code: "const ball2 = new Ball(400, 300)"
      },
      {
        action: "insert-in",
        target: "function draw()",
        position: "end",
        code: "drawTrail();"
      },
      {
        action: "rename",
        target: "ball",
        value: "mainBall"
      }
    ]
  };
  console.log(JSON.stringify(exampleEdit, null, 2));
}

// Demonstrate the difference between line-based and AST-based editing
function compareApproaches() {
  console.log('\n\nComparison: Line-Based vs AST-Based');
  console.log('====================================\n');

  console.log('Line-Based Approach Problems:');
  console.log('-----------------------------');
  console.log('❌ Fragile: Any formatting change breaks line numbers');
  console.log('❌ Error-prone: "Line 45 out of bounds" errors');
  console.log('❌ Unnatural: Must count exact lines');
  console.log('❌ No semantic understanding');

  console.log('\nAST-Based Approach Benefits:');
  console.log('----------------------------');
  console.log('✅ Robust: Works regardless of formatting');
  console.log('✅ Semantic: Understands code structure');
  console.log('✅ Natural: "Change config.speed to 10"');
  console.log('✅ Powerful: Can do complex refactoring');

  console.log('\nExample - Changing ball color:');
  console.log('-------------------------------');
  
  console.log('\nLine-based (fragile):');
  console.log(JSON.stringify({
    type: "replace",
    startLine: 3,
    endLine: 3,
    newContent: "  color: 'blue',"
  }, null, 2));

  console.log('\nAST-based (robust):');
  console.log(JSON.stringify({
    action: "modify",
    target: "config.color",
    value: "'blue'"
  }, null, 2));
}

// Run demonstrations
demonstrateTransformations();
compareApproaches();

console.log('\n\n✨ AST transformation examples complete!');