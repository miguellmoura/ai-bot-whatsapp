import fs from "fs";

function normalizePhone(value) {
  return String(value || "").replace(/[^\d+]/g, "");
}

function toSlug(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function loadEstablishments() {
  const establishmentsUrl = new URL("../../establishments.json", import.meta.url);

  if (fs.existsSync(establishmentsUrl)) {
    const rows = JSON.parse(fs.readFileSync(establishmentsUrl, "utf8"));
    const establishments = rows.map((row) => ({
      id: row.id || toSlug(row.name),
      ...row,
    }));
    return { establishments, source: "establishments.json" };
  }

  const clinicUrl = new URL("../../clinica.json", import.meta.url);
  const clinic = JSON.parse(fs.readFileSync(clinicUrl, "utf8"));
  const single = {
    id: "clinica-principal",
    ...clinic,
  };
  return { establishments: [single], source: "clinica.json" };
}

export function findEstablishment({ establishments, establishmentId, twilioTo }) {
  if (establishmentId) {
    return (
      establishments.find((e) => e.id === establishmentId) ||
      establishments.find((e) => toSlug(e.name) === toSlug(establishmentId))
    );
  }

  if (twilioTo) {
    const normalizedTo = normalizePhone(twilioTo);
    return establishments.find(
      (e) => normalizePhone(e.twilio_number) === normalizedTo,
    );
  }

  return establishments[0];
}
