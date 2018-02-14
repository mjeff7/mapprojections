'use strict';

const DATA_URL = 'https://raw.githubusercontent.com/FreeCodeCamp/ProjectReferenceData/master/meteorite-strike-data.json',
      // Following URL taken from: https://bl.ocks.org/abenrob/c4ac3d581a7b16ff5f2f;
      WORLD_MAP_JSON_URL = 'https://gist.githubusercontent.com/abenrob/787723ca91772591b47e/raw/8a7f176072d508218e120773943b595c998991be/world-50m.json';

function loadjson(urls, callback) {
  let data = urls.slice(),
      collectedResults = [];
  
  urls.forEach((url, index) => {
    d3.json(url, result => {
      data[index] = result;

      collectedResults.push(index);
      if(collectedResults[urls.length - 1] === index)
        callback(...data);
    })
  });  
}

function isRotationLocked() {
  return document.getElementById('rotationLocked').checked;
}

function trackballController() {
  // return a function d3 style with member functions to adjust parameters and where
  // the function itself returns appropriate rotations.
  
  let startCoordinate, initialEuler;
  
  function trackballController(endCoordinate) {
    let q = new THREE.Quaternion().setFromUnitVectors(startCoordinate, endCoordinate).multiply(initialEuler),
        e = new THREE.Euler().setFromQuaternion(q, 'ZXY');
    
    return [e.y, e.x, -e.z];
  }
  
  trackballController.setStartCoordinate = v => startCoordinate = v;
  trackballController.setStartEuler = (y,x,minusZ) => {
    initialEuler = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(x, y, -minusZ, 'ZXY')
    );
  };
  
  return trackballController;
}

const findRoot = findRootNumeric;
function findRootNumeric(f, initial_guess) {
  return numeric.uncmin(f, initial_guess).solution;
}

function getZoomers(parameters) {
  const {projectionController,
         getMouseInProjection,
         update,
         setZoom} = parameters;
  
  function getClickCoordinates() {
    return projectionController().projection.invert(getMouseInProjection());
  }
    
  let projectionZoom = (() => {
    const trackball = trackballController();
    function projectionZoom() {
      //console.log("Zooming", d3.event, d3.event.scale);
      let xy = getMouseInProjection(),
          newScale = d3.event.scale;
      let result = trackball(clickToUnitVector(...xy)).map(a => a * 180 / Math.PI);
      //console.log('Result Euler: ', result);
      //zoomScale = newScale;
      
      if(isRotationLocked())
        result[1] = result[2] = 0;
      projectionController().projection.rotate(result);
      //projectionController().projection.scale(100 * newScale);
      setZoom(newScale);
      update();
    }
    
    function projectionZoomStart() {
      let xy = getMouseInProjection(),
          initialRotate = projectionController().projection.rotate();
      trackball.setStartCoordinate(clickToUnitVector(...xy));
      trackball.setStartEuler(...initialRotate.map(a => a * Math.PI / 180));
    };

    function clickToUnitVector(xClick, yClick) {
      let radius = projectionController().projection.scale(),
          x = xClick - projectionController().projection.translate()[0],
          y = yClick - projectionController().projection.translate()[1],
          z = Math.sqrt(radius*radius - x*x - y*y) || 0; // maps NaN → 0
      //console.log(z)
      let result = new THREE.Vector3(x,y,z).normalize();
      //console.log('New coordinate: ', result.x, result.y, result.z)
      return result;
    }
 
    return {
      zoom: projectionZoom,
      zoomstart: projectionZoomStart
    };
  })();
  
  let rootZoom = (() => {
    let startCoordinates;
    
    function trackMouse() {
      let mouse = getMouseInProjection(),
          resultingCoordinates,
          rotationIsLocked = isRotationLocked(),
          f = guess => {
            if(rotationIsLocked)
              guess[1] = guess[2] = 0;
            projectionController().projection.rotate(guess);
            resultingCoordinates = projectionController().projection(startCoordinates);
           //console.log(`Seeking ${mouse} with ${resultingCoordinates}`) 
            return Math.pow(resultingCoordinates[0] - mouse[0], 2)
              + Math.pow(resultingCoordinates[1] - mouse[1], 2);
          },
          rotation = projectionController().projection.rotate(),
          newRotation = findRoot(f, rotation);
      projectionController().projection.rotate(newRotation);
    }
    
    function rootZoom() {
      //console.log('Zoom')
      if(!setZoom(d3.event.scale))
        trackMouse();
      
      update();
    }
    
    function rootZoomStart() {
      //console.log('Zoom start')
      startCoordinates = getClickCoordinates();
    }
    
    return {
      zoom: rootZoom,
      zoomstart: rootZoomStart
    };
  })();
  
  return {projectionZoom, rootZoom};
}

function setupMap() {
  let zoomScale = 1, update = () => null;
  
  //////////////////////////////////////////////
  // Projections
  //////////////////////////////////////////////
  function getMouseInProjection() { return d3.mouse(globalGroup.node()); }

  function setZoom(newZoomScale) {
    if(zoomScale === newZoomScale)
      return false;
    
    let [mouseLeft, mouseTop] = getMouseInProjection(),
        {left, top, width, height} = setViewBox(),
        defaultViewBox = projectionController.viewBox(),
        zoomAdjust = zoomScale / newZoomScale,
        newViewBox = {
          left: mouseLeft - (mouseLeft - left) * zoomAdjust,
          top: mouseTop - (mouseTop - top) * zoomAdjust,
          width: width * zoomAdjust,
          height: height * zoomAdjust
        };
    
    zoomScale = newZoomScale;
    
    newViewBox.left = clip(newViewBox.left,
                           defaultViewBox.left,
                           defaultViewBox.left + defaultViewBox.width - newViewBox.width);
    
    newViewBox.top = clip(newViewBox.top,
                          defaultViewBox.top,
                          defaultViewBox.top + defaultViewBox.height - newViewBox.height);
    
    setViewBox(newViewBox);
    
    return true;
  }
  
  const defaultBounds = {left: -320, top: -160, width: 640, height: 320};
  let projectionController,
      {rootZoom, projectionZoom} = getZoomers(
        {
          projectionController: () => projectionController,
          getMouseInProjection,
          update: () => update(),
          setZoom
        }),
      projectionControllers = {
        robinson: {
          name: "Robinson",
          projection: d3.geo.robinson().scale(100).translate([0,0]),
          viewBox: () => defaultBounds,
          zoom: rootZoom
        },
        mercator: {
          name: "Mercator",
          projection: d3.geo.mercator().scale(100).translate([0,0]),
          viewBox: () => defaultBounds,
          zoom: rootZoom
        },
        azimuthalEqualArea: {
          name: "Equal area azimuthal",
          projection: d3.geo.azimuthalEqualArea().clipAngle(90).scale(100).translate([0,0]),
          viewBox: () => ({left: -100 * Math.sqrt(2),
                           top: -100 * Math.sqrt(2),
                           width: 200 * Math.sqrt(2),
                           height: 200 * Math.sqrt(2)}),
          zoom: rootZoom,
          hideBackFaceEvents: true
        },
        orthographic: {
          name: "Orthographic",
          projection: d3.geo.orthographic().clipAngle(90).scale(100).translate([0,0]),
          viewBox: () => ({left: -100, top: -100, width: 200, height: 200}),
          zoom: projectionZoom,
          hideBackFaceEvents: true
        }
      };

  //////////////////////////////////////////////
  // Setup projection-agnostic DOM element
  //////////////////////////////////////////////
  const body = d3.select('body'),
        svg = body.insert('svg');
  
  function setViewBox(viewBox) {
    if(viewBox === undefined)
      return setViewBox.currentViewBox;
    
    setViewBox.currentViewBox = viewBox;
    svg.attr('viewBox',
             (d => `${d.left} ${d.top} ${d.width} ${d.height}`)(setViewBox.currentViewBox));
  }

  const path = (() => {
    const simplifier = d3.geo.transform({
      point: function(x,y,z) {
        if(z > 0.1/zoomScale)
          this.stream.point(x, y)
      }}),
          customStream = {stream:
                          s => simplifier.stream(projectionController.projection.stream(s))};
    
          return d3.geo.path().projection(customStream);
  })();
  
  const globalGroup = svg.insert('g').attr('id', 'world');

  Object.keys(projectionControllers).forEach(key => {
    let controller = projectionControllers[key];
    d3.select('#projections')
      .append('button').text(controller.name)
      .on('click', () => setProjection(key));
  });
  
  function setProjection(projection) {
    svg.transition().duration(500).attr('opacity', 0)
      .each('end', () => {
        projectionController = projectionControllers[projection];
        setViewBox(projectionController.viewBox());

        const zoom = d3.behavior.zoom().scaleExtent([1, 10]);
        Object.keys(projectionController.zoom).forEach(
          key => zoom.on(key, projectionController.zoom[key])
        );
        svg.call(zoom);

        update();
      })
    .transition().attr('opacity', 1);
  }
  
  setProjection('robinson');
  
  
  function buildMap(worldData, meteorData) {
    const simplifiedWorldData = topojson.presimplify(worldData),
          landFeatures = topojson.feature(simplifiedWorldData, simplifiedWorldData.objects.land),
          borderFeatures = topojson.mesh(simplifiedWorldData, simplifiedWorldData.objects.countries,
                                         (a,b) => a !== b);
    
    let drawables =
        // [sphereObj, landObj, bordersObj] = // don't need these
        [['sphere', {type:'Sphere'}],
         ['land', landFeatures],
         ['borders', borderFeatures]]
          .map(obj =>
               globalGroup.insert('path')
               .classed(obj[0], true)
               .datum(obj[1]))

    function updateLand() {
      // [sphereObj, landObj, bordersObj].forEach(o => o.attr('d', path));
        drawables.forEach(d => d.attr('d', path));
    };

    ///////////////////////
    // Setup meteor data
    ///////////////////////
    let circles,
        meteorFeatures = meteorData.features;

    
    meteorFeatures = meteorFeatures.filter(d => d.geometry);
    meteorFeatures.forEach(d => d.properties.displayMass = +d.properties.mass || 10);
    

    const tipDiv = body.insert('div').classed('tooltip', true);
    
    circles = globalGroup.insert('g').classed('meteors', true).selectAll('circle')
      .data(meteorFeatures);
    circles.enter().insert('circle').classed('meteor', true)
      .on('mouseover', d => {
      tipDiv.html(htmlTip(d));
      tipDiv
        .transition().duration(100)
        .style('left', d3.event.pageX + 'px')
        .style('top', d3.event.pageY + 'px')
        .style('opacity', 1);
    })
      .on('mouseout', () => tipDiv.transition().delay(50).style('opacity', 0));

    ///////////////////////
    // Updating functions
    ///////////////////////
    let minMass = Math.min(...meteorFeatures.map(d => +d.properties.displayMass).filter(d => d > 0));
    function updateCircleRadii() {
      circles.attr('r', d => Math.log(d.properties.displayMass / minMass) / zoomScale / 3);
    }

    function updateCircleLocations() {
      const visibleCenter = projectionController.projection.rotate().map(c => -c);
      meteorFeatures.forEach(d => {
        d.location = projectionController.projection(d.geometry.coordinates);
        if(projectionController.hideBackFaceEvents)
          if(d3.geo.distance(d.geometry.coordinates, visibleCenter) > Math.PI / 2)
            d.location = [-10000, -10000];
      });

      circles
        .attr('cx', d => d.location[0])
        .attr('cy', d => d.location[1]);
    }

    update = () => {
      updateLand();
      updateCircleLocations();
      updateCircleRadii();
    }
    
    update();
  }
  
  return buildMap;
}

function go() {
  let buildMap = setupMap();
  loadjson([WORLD_MAP_JSON_URL, DATA_URL], buildMap);
}

go();
  
//////////////////////////////////////////////
// Support functions
//////////////////////////////////////////////
let numericFormatter = d3.format(',.1f');
function formatCoord(number, directions) {
  return `${numericFormatter(Math.abs(number))}°${number >= 0 ? directions[0] : directions[1]}`;
}
function formatMass(mass) {
  let adjustedMassValue, label;
  
  if(mass === null) return 'Unknown';
  
  if(mass >= 1000) {
    label = 'kg';
    adjustedMassValue = numericFormatter(mass / 1000);
  } else {
    label = 'g';
    adjustedMassValue = mass;
  }
  return adjustedMassValue + ' ' + label;
}
function htmlTip(d) {
  let props = d.properties;
  let properties = [
    ['Name', `${props.name} (id ${props.id})`],
    ['Mass', formatMass(props.mass)],
    ['Location', `${formatCoord(props.reclat, "NS")}, ${formatCoord(props.reclong, "EW")}`],
    ['Year', props.year.slice(0, 4)],
    ['Fall observed', props.fall === 'Fell' ? 'Yes' : 'No'],
    ['Classification', props.recclass]
  ];
  
  return properties.map(p => `<div class="property ${p[0].split(' ')[0]}">
                                <span class="label">${p[0]}</span>
                                <span class="value">${p[1]}</span>
                              </div>`)
                   .join('');
}

function clip(value, lowerBound, upperBound) {
  if(value <= lowerBound) return lowerBound;
  if(value >= upperBound) return upperBound;
  return value;
}



//////////////////////////////////////////
// RETIRED CODE
//    because there's no version control
//////////////////////////////////////////

// findRoot takes a function f of a 3 dimensional parameter and returns a
// root of f.
function findRootSeek(f, initial_guess) {
  // Uses a small step size and 4 points around the current guess and just updates
  // to the point giving the smallest value of f.
  
  let step = 4;
  
  let x0, x1, x2, magnitude,
      previous_best_magnitude,
      best_magnitude = Math.abs(f(initial_guess)),
      best_guess = initial_guess;
  
  const tryGuess = g => {
          //if(g[0] > 180) g[0] -= 360;
          //if(g[0] < -180) g[0] += 360;
          //if(Math.abs(g[1]) > 90) return;
          magnitude = Math.abs(f(g));
          //console.log('Magnitude: ', magnitude);
          if(magnitude < best_magnitude) {
            best_guess = g;
            best_magnitude = magnitude;
          }
        };
  
  for(let i = 0; i < 100; i++) {
    //console.log(`Magnitudes(${i}): `, best_magnitude, previous_best_magnitude, step);
    previous_best_magnitude = best_magnitude;
    
    [x0, x1, x2] = best_guess;
    tryGuess([x0 - step, x1, x2]);
    tryGuess([x0 + step, x1, x2]);
    tryGuess([x0, x1 - step, x2]);
    tryGuess([x0, x1 + step, x2]);
    tryGuess([x0, x1, x2 - step]);
    tryGuess([x0, x1, x2 + step]);
    
    // No update
    if(best_magnitude === previous_best_magnitude) {
      step /= 2;
      
      if(step < 0.01)
        break;
    }
  }
  
  return best_guess;
}




function getZoomers__RETIRED_COMPONENTS(parameters) {
  function panZoom() {
    zoomScale = d3.event.scale;
    let scaledWidth = projectionController().viewBox().width * zoomScale;
    let translateMod = d3.event.translate.slice();
    translateMod[0] -= Math.floor(translateMod[0] / scaledWidth) * scaledWidth;

    globalGroup.attr('transform',
                     `translate(${translateMod})scale(${zoomScale})`);
    updateCircleRadii();

    // panZoom support code below. Insert below global group so it clones properly.

    /*svg.insert('use')
    .attr('id', 'worldClone')
    .attr('xlink:href', '#world')
    .attr('x', -projectionController().viewBox().width)
    */
    
    // Insert below in update function
    
    /*
      d3.select('#worldClone')
        .attr('x', -projectionController().viewBox().width * zoomScale)
   */ 
  }
  
  let flatZoom = (() => {
    // Store the longitude of the starting point and of the current
    // point and set the rotation based on that.
    let startCoordinates;
    
    function flatZoom() {
      //console.log('Zoom')
      // Adjust zoom before getting mouse coordinates so that
      // zooming zooms in around nearer the mouse. This is much more
      // accurate when distortions in the map are small.
      projectionController().projection.scale(100 * d3.event.scale);
      
      let newCoordinates = getClickCoordinates(),
          rotation = projectionController().projection.rotate();
      
      rotation[0] += newCoordinates[0] - startCoordinates[0];
      rotation[1] += newCoordinates[1] - startCoordinates[1];
      projectionController().projection.rotate(rotation);
      
      update();
    }
    
    function flatZoomStart() {
      //console.log('Zoom start')
      startCoordinates = getClickCoordinates();
    }
    
    return {
      zoom: flatZoom,
      zoomstart: flatZoomStart
    };
  })();
}