module.exports = (req, res) => {
  res.end(`<h1>Hello ID: ${req.params.id} - ${req.query.foo}!</h1>`);
};
