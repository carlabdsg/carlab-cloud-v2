"use strict";
const dual = (company) =>
  String(company || "")
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("es-MX") === "ans";
module.exports = { dual };
