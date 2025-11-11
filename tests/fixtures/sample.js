// Test fixture file with known SonarLint issues
function testFunction() {
  var unusedVar = 42; // S1481: Unused local variable

  const x = true;
  if (x) { // S2583: Condition always true
    console.log("This will always execute");
  }

  let password = "hardcoded123"; // S2068: Hard-coded credentials

  return; // S3626: Redundant return statement
}

function tooManyParams(a, b, c, d, e, f, g, h) { // S107: Too many parameters
  return a + b + c + d + e + f + g + h;
}

module.exports = { testFunction, tooManyParams };
