const { exec } = require("child_process");
const fs = require("fs");

function handle(req, res) {
  const name = req.query.name;
  exec("ls " + name, (err, out) => res.send(out));
  const data = fs.readFileSync(req.query.path);
  eval(req.body.code);
  const re = /^(a+)+$/;
  return re.test(name) && data;
}

module.exports = { handle };
