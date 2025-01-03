class Simulation {
  constructor(el) {
    if(el instanceof HTMLElement && el.nodeName.toLowerCase() === 'canvas') {
      this.el = el;
      this.ctx = el.getContext('2d');

      this.bodies = [];

      this.run = this.run.bind(this);
    } else {
      return null;
    }
  }

  addBody(body) {
    if(body instanceof Body) {
      body.yearsPerFrame = this.yearsPerFrame;
      body.dimensions = this.pxdimensions;
      this.bodies.push(body);
    }
    return this.bodies.length-1;
  }
  removeBody(i) {
    this.bodies.splice(i,1);
  }

  update() {
    // Set up the canvas for drawing
    this.ctx.fillStyle = `rgba(0,10,20,.9)`;
    // this.ctx.clearRect(0,0,this.el.width,this.el.height);
    this.ctx.fillRect(0,0,this.el.width,this.el.height);
    this.ctx.translate(this.pxdimensions.width*.5, this.pxdimensions.height*.5);


    const lineThreshold = 80000;

    // Loop through all of the bodies
    this.bodies.forEach((bodyX) => {
      const acceleration = new Vector(0,0); // This is our basal, new acceleration for this body
      // For all the other bodies, calculate the combined force asserted on this
      this.bodies.forEach((bodyY) => {
        const distance = bodyY.position.subtractNew(bodyX.position); // The distance between the two bodies
        const sqD = distance.lengthSquared; // The distance squared (cheaper than calculating actual distance, see: Pythagoras)
        const force = (this.gravitationalConstant * bodyY.mass) / (sqD * Math.sqrt(sqD * this.smoothing)); // Here's some newtonian motion with a some softening to stop it from reaching infinity

        acceleration.add(distance.scale(force));

        if(sqD < lineThreshold) {
          this.ctx.beginPath();
          this.ctx.strokeStyle = `rgba(255,255,255,${((lineThreshold-sqD)/lineThreshold)*.5})`;
          this.ctx.lineWidth = 0;
          this.ctx.moveTo(bodyX.position.x, bodyX.position.y);
          this.ctx.lineTo(bodyY.position.x, bodyY.position.y);
          this.ctx.stroke();
        }
      });
      // Update the basal body's accelaration with the calucalted factor
      bodyX.acceleration = acceleration;

      // Draw the body
      this.ctx.beginPath();
      this.ctx.fillStyle = `rgba(200,255,255,1)`;
      this.ctx.arc(bodyX.position.x, bodyX.position.y, bodyX.size, 0, 2 * Math.PI);
      this.ctx.fill();

      // Solve for the next frame
      bodyX.solve();
    });
    // Reset current transformation matrix to the identity matrix
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  run(delta) {
    if(this.running === true) {
      requestAnimationFrame(this.run);
    }

    this.update();
  }

  set running(value) {
    if(this.running === false && value === true) requestAnimationFrame(this.run);
    this._running = value === true;
  }
  get running() {
    return this._running === true;
  }

  set pxratio(value) {
    if(!isNaN(value)) {
      this._pxratio = value;
    }
  }
  get pxratio() {
    return this._pxratio || 1;
  }

  set dimensions(value) {
    if(value instanceof Vector) {
      this._dimensions = value;
      this._pxdimensions = value.scale(this.pxratio);
      this.el.width = this._pxdimensions.width;
      this.el.height = this._pxdimensions.height;

      // Set up the canvas for drawing
      this.ctx.fillStyle = `rgba(20,20,20,1)`;
      // this.ctx.clearRect(0,0,this.el.width,this.el.height);
      this.ctx.fillRect(0,0,this.el.width,this.el.height);
    }
  }
  get dimensions() {
    return this._dimensions || new Vector(this.el.width/this.pxratio, this.el.height/this.pxratio);
  }

  get pxdimensions() {
    return this._pxdimensions || new Vector(this.el.width, this.el.height);
  }

  set gravitationalConstant(value) {
    if(!isNaN(value)) this._gravitationalConstant = value;
  }
  get gravitationalConstant() {
    return this._gravitationalConstant || 40;
  }

  set smoothing(value) {
    if(!isNaN(value)) this._smoothing = value;
  }
  get smoothing() {
    return this._smoothing || .5;
  }

  set yearsPerFrame(value) {
    if(!isNaN(value)) this._yearsPerFrame = value;
  }
  get yearsPerFrame() {
    return this._yearsPerFrame || .2;
  }
}

class Body {
  constructor(position, velocity, mass, size, fixed = false) {
    this.position = position;
    this.velocity = velocity;
    this.acceleration = new Vector(0,0);
    this.mass = mass;
    this.size = size;
    this.fixed = fixed;
  }

  solve() {
    if(this.fixed) return;
    // console.log(this.acceleration)
    let vel= this.velocity.addNew(this.acceleration.scaleNew(this.yearsPerFrame));
    this.velocity = vel;
    this.position.add(this.velocity.scaleNew(this.yearsPerFrame));
    if(this.position.x > this.dimensions.x * .5 + 30.) {
      this.position.x = this.dimensions.x * -.5 - 10.;
    } else if(this.position.x < this.dimensions.x * -.5 - 30.) {
      this.position.x = this.dimensions.x * .5 + 10.;
    }
    if(this.position.y > this.dimensions.y * .5 + 30.) {
      this.position.y = this.dimensions.y * -.5 - 10.;
    } else if(this.position.y < this.dimensions.y * -.5 - 30.) {
      this.position.y = this.dimensions.y * .5 + 10.;
    }
  }

  set fixed(value) {
    this._fixed = value === true;
  }
  get fixed() {
    return this._fixed === true;
  }

  set position(value) {
    if(value instanceof Vector) {
      this._position = value;
    }
  }
  get position() {
    return this._position || null;
  }

  set friction(value) {
    if(!isNaN(value)) {
      this._friction = value;
    }
  }
  get friction() {
    return this._friction || .99;
  }

  set maxVelocity(value) {
    if(!isNaN(value)) {
      this._maxVelocity = value;
    }
  }
  get maxVelocity() {
    return this._maxVelocity || 50.;
  }

  set velocity(value) {
    if(value instanceof Vector) {
      if(value.length > this.maxVelocity) value.normalise().scale(this.maxVelocity);
      value.scale(this.friction);
      this._velocity = value;
    }
  }
  get velocity() {
    return this._velocity || null;
  }

  set acceleration(value) {
    if(value instanceof Vector) {
      this._acceleration = value;
    }
  }
  get acceleration() {
    return this._acceleration || null;
  }

  set mass(value) {
    if(!isNaN(value)) {
      this._mass = value;
    }
  }
  get mass() {
    return this._mass || 0;
  }

  set size(value) {
    if(!isNaN(value)) {
      this._size = value;
    }
  }
  get size() {
    return this._size || 0;
  }

  set yearsPerFrame(value) {
    if(!isNaN(value)) this._yearsPerFrame = value;
  }
  get yearsPerFrame() {
    return this._yearsPerFrame || .008;
  }
}

//console.clear();

const sim = new Simulation(document.querySelector('canvas'));
sim.dimensions = new Vector(window.innerWidth, window.innerHeight);
console.log(sim.dimensions)
window.addEventListener('resize', (e) => {
  sim.dimensions = new Vector(window.innerWidth, window.innerHeight);
});

let mouseBody = new Body(new Vector(0, 0), new Vector(0,0), -1000, 50, true);
let bodyIndex = null;
window.addEventListener('pointerdown', (e) => {
  mouseBody.position.x = e.pageX - window.innerWidth * .5;
  mouseBody.position.y = e.pageY - window.innerHeight * .5;
  console.log(mouseBody.position);
  bodyIndex = sim.addBody(mouseBody);
});
window.addEventListener('pointermove', (e) => {
  mouseBody.position.x = e.pageX - window.innerWidth * .5;
  mouseBody.position.y = e.pageY - window.innerHeight * .5;
});
window.addEventListener('pointerup', (e) => {
  sim.removeBody(bodyIndex);
  bodyIndex = null;
});

// sim.addBody(new Body(new Vector(0, 0), new Vector(0,0), -3, 50, true));
// sim.addBody(new Body(new Vector(0, 500), new Vector(0,0), 1, 10, true));

for(i=0;i<window.innerWidth * window.innerHeight * 0.00008;i++) {
  const r = new Vector(400 + Math.random() * 500, Math.random() * Math.PI * 2.);
  const p = new Vector(Math.cos(r.y) * r.x, Math.sin(r.y) * r.x);
  const a = new Vector(p.y, -p.x).normalise().scale(10.);
  // const a = new Vector(0,0);
  const rf = Math.random();
  sim.addBody(new Body(p, a, -10 + rf * 15., 1 + rf * 10));
  // sim.addBody(new Body(p, a, .5 + rf * .5, 5 + rf * 5.));

}

sim.running = true;