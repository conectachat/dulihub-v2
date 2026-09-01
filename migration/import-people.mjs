#!/usr/bin/env node
/**
 * Importa contatos, leads e clientes do DuliHub antigo para o cadastro único
 * de pessoas do DuliHub v2.
 *
 * O QUE ESTE SCRIPT RESOLVE
 *
 * No app antigo a mesma pessoa existia em até três tabelas: `contacts`,
 * `leads` e `client_profiles`. As duas últimas apontam para a primeira por
 * `contact_id` — então `contacts` é a espinha, e a deduplicação usa esse
 * vínculo em vez de adivinhar por nome ou email.
 *
 * Quem não tem `contact_id` (lead ou cliente criado solto) vira uma pessoa
 * própria. Nada é descartado.
 *
 * O estágio final segue a hierarquia: cliente vence oportunidade, que vence
 * contato. Uma pessoa que é cliente hoje entra como cliente, mesmo que também
 * exista como lead antigo.
 *
 * PODE RODAR QUANTAS VEZES QUISER. O casamento é feito por `legacy_id`, então
 * a segunda execução atualiza em vez de duplicar.
 *
 * NENHUMA SENHA É GRAVADA. As duas são lidas do terminal com eco desligado e
 * vivem só na memória do processo.
 *
 * Uso:
 *   node migration/import-people.mjs            aplica
 *   node migration/import-people.mjs --dry-run  só mostra o que faria
 */

import { createInterface } from "node:readline";

const OLD = {
  url: "https://tqbvyshfeoneipcfipzx.supabase.co",
  key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxYnZ5c2hmZW9uZWlwY2ZpcHp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI5Njc2OTUsImV4cCI6MjA3ODU0MzY5NX0.kBShDxpxZ80FMkiGSCivYIzMegY6V1b03jNVW3Dm1t4",
};

const NEW = {
  url: "https://xigmtofpmfqeehhcdasf.supabase.co",
  key: "sb_publishable_VqP7hICOClMVJ-NEbxo1yQ_DqXZCDH_",
};

const DRY_RUN = process.argv.includes("--dry-run");
const PAGE = 1000;

// ---------------------------------------------------------------- utilidades

function ask(question, mask = false) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    if (!mask) {
      rl.question(question, (a) => {
        rl.close();
        resolve(a.trim());
      });
      return;
    }
    process.stdout.write(question);
    rl._writeToOutput = () => rl.output.write(`\r${question}`);
    rl.question("", (a) => {
      rl.close();
      process.stdout.write("\n");
      resolve(a);
    });
  });
}

async function login({ url, key }, email, password) {
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new Error(`Login em ${url} falhou (${res.status}): ${(await res.text()).slice(0, 180)}`);
  }
  const session = await res.json();
  return session.access_token;
}

/** Baixa uma tabela inteira, paginando pelo header Range do PostgREST. */
async function fetchAll({ url, key }, token, table, select = "*") {
  const rows = [];
  for (let offset = 0; ; offset += PAGE) {
    const res = await fetch(`${url}/rest/v1/${table}?select=${select}`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${token}`,
        Range: `${offset}-${offset + PAGE - 1}`,
      },
    });
    if (!res.ok) throw new Error(`${table}: HTTP ${res.status} ${(await res.text()).slice(0, 160)}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

const clean = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};

/** Mantém o primeiro valor não vazio. Usado ao sobrepor as três origens. */
const coalesce = (...values) => values.map(clean).find((v) => v !== null) ?? null;

// ------------------------------------------------------------ transformação

function addressFrom(src) {
  return {
    address_street: clean(src.logradouro),
    address_number: clean(src.numero),
    address_complement: clean(src.complemento),
    address_district: clean(src.bairro),
    address_city: clean(src.cidade),
    address_state: clean(src.estado),
    address_country: clean(src.pais),
    address_postal_code: clean(src.cep),
  };
}

const hasAddress = (a) => Object.values(a).some((v) => v !== null);

/**
 * Molde canônico de uma pessoa.
 *
 * Toda linha enviada precisa ter EXATAMENTE estas chaves. O PostgREST recusa
 * inserção em lote quando os objetos têm formatos diferentes:
 *
 *   PGRST102 — All object keys must match
 *
 * E as três origens produzem formatos diferentes por natureza: contato traz
 * endereço, lead não traz, cliente traz documentos. Normalizar contra o molde
 * resolve na saída, sem espalhar campos nulos pela lógica de fusão.
 */
const PERSON_TEMPLATE = {
  legacy_id: null,
  full_name: null,
  email: null,
  phone: null,
  phone_country_code: null,
  extra_phones: [],
  company: null,
  job_title: null,
  gender: null,
  notes: null,
  tax_id: null,
  national_id: null,
  national_id_issuer: null,
  birth_date: null,
  nationality: null,
  birthplace: null,
  marital_status: null,
  address_street: null,
  address_number: null,
  address_complement: null,
  address_district: null,
  address_city: null,
  address_state: null,
  address_country: null,
  address_postal_code: null,
  lifecycle_stage: "contact",
  created_at: null,
  deleted_at: null,
};

function normalize(person) {
  const row = { ...PERSON_TEMPLATE, ...person };

  // Colunas NOT NULL não aceitam nulo explícito, e omiti-las quebraria a
  // uniformidade de chaves. Então preenchemos aqui.
  row.extra_phones = Array.isArray(row.extra_phones) ? row.extra_phones : [];
  row.created_at = row.created_at ?? new Date().toISOString();
  row.full_name = row.full_name ?? "Sem nome";

  return row;
}

/**
 * Funde as três origens numa lista de pessoas.
 *
 * A chave de deduplicação é o id do contato. Lead e cliente que apontam para
 * o mesmo contato viram UMA pessoa.
 */
function mergePeople({ contacts, leads, clients }) {
  const byKey = new Map();

  const keyOf = (row, table) =>
    row.contact_id ? `contact:${row.contact_id}` : `${table}:${row.id}`;

  for (const c of contacts) {
    byKey.set(`contact:${c.id}`, {
      legacy_id: `contact:${c.id}`,
      full_name: coalesce(c.nome) ?? "Sem nome",
      email: coalesce(c.email),
      phone: coalesce(c.telefone),
      phone_country_code: coalesce(c.telefone_pais_codigo),
      extra_phones: Array.isArray(c.extra_phones) ? c.extra_phones : [],
      company: coalesce(c.empresa),
      job_title: coalesce(c.cargo),
      gender: coalesce(c.sexo),
      notes: coalesce(c.observacoes),
      ...addressFrom(c),
      lifecycle_stage: "contact",
      created_at: c.created_at ?? null,
      deleted_at: c.deleted_at ?? null,
    });
  }

  // Leads: promovem a pessoa a oportunidade e completam o que faltar.
  for (const l of leads) {
    const key = keyOf(l, "lead");
    const existing = byKey.get(key);
    if (existing) {
      existing.lifecycle_stage = "opportunity";
      existing.full_name = coalesce(existing.full_name, l.nome) ?? existing.full_name;
      existing.email = coalesce(existing.email, l.email);
      existing.phone = coalesce(existing.phone, l.telefone);
      existing.phone_country_code = coalesce(existing.phone_country_code, l.telefone_pais_codigo);
      existing.company = coalesce(existing.company, l.empresa);
      existing.job_title = coalesce(existing.job_title, l.cargo);
      existing.notes = coalesce(existing.notes, l.notas);
    } else {
      byKey.set(key, {
        legacy_id: key,
        full_name: coalesce(l.nome) ?? "Sem nome",
        email: coalesce(l.email),
        phone: coalesce(l.telefone),
        phone_country_code: coalesce(l.telefone_pais_codigo),
        extra_phones: [],
        company: coalesce(l.empresa),
        job_title: coalesce(l.cargo),
        notes: coalesce(l.notas),
        lifecycle_stage: "opportunity",
        created_at: l.created_at ?? null,
        deleted_at: null,
      });
    }
  }

  // Clientes: vencem tudo. Trazem os documentos e o endereço mais completo.
  for (const cp of clients) {
    const key = keyOf(cp, "client");
    const address = addressFrom(cp);
    const identity = {
      tax_id: coalesce(cp.cpf),
      national_id: coalesce(cp.rg),
      national_id_issuer: coalesce(cp.orgao_expeditor),
      birth_date: cp.data_nascimento ?? null,
      nationality: coalesce(cp.nacionalidade),
      birthplace: coalesce(cp.naturalidade),
      marital_status: coalesce(cp.estado_civil),
      gender: coalesce(cp.sexo),
    };

    const existing = byKey.get(key);
    if (existing) {
      existing.lifecycle_stage = "client";
      existing.full_name = coalesce(cp.nome_completo, existing.full_name);
      existing.email = coalesce(existing.email, cp.email);
      existing.phone = coalesce(existing.phone, cp.telefone);
      existing.phone_country_code = coalesce(existing.phone_country_code, cp.telefone_pais_codigo);
      for (const [k, v] of Object.entries(identity)) {
        if (v !== null) existing[k] = v;
      }
      // Endereço do cliente é o do contrato: mais confiável que o do contato.
      if (hasAddress(address)) Object.assign(existing, address);
    } else {
      byKey.set(key, {
        legacy_id: key,
        full_name: coalesce(cp.nome_completo) ?? "Sem nome",
        email: coalesce(cp.email),
        phone: coalesce(cp.telefone),
        phone_country_code: coalesce(cp.telefone_pais_codigo),
        extra_phones: [],
        ...identity,
        ...address,
        lifecycle_stage: "client",
        created_at: cp.created_at ?? null,
        deleted_at: null,
      });
    }
  }

  return [...byKey.values()].map(normalize);
}

// ------------------------------------------------------------------ execução

async function main() {
  console.log(`Importação de pessoas — DuliHub antigo para o novo${DRY_RUN ? "  [SIMULAÇÃO]" : ""}\n`);
  console.log("Precisa de dois logins de administrador: um em cada projeto.");
  console.log("As senhas não aparecem na tela e não são gravadas.\n");

  const oldEmail = await ask("App ANTIGO  — email: ");
  const oldPass = await ask("App ANTIGO  — senha: ", true);
  const newEmail = await ask("App NOVO    — email: ");
  const newPass = await ask("App NOVO    — senha: ", true);

  console.log("\nAutenticando...");
  const oldToken = await login(OLD, oldEmail, oldPass);
  const newToken = await login(NEW, newEmail, newPass);

  // A organização vem da RLS: o usuário só enxerga a própria.
  const membershipRes = await fetch(
    `${NEW.url}/rest/v1/organization_members?select=organization_id&limit=1`,
    { headers: { apikey: NEW.key, Authorization: `Bearer ${newToken}` } },
  );
  const membership = await membershipRes.json();
  const organizationId = membership?.[0]?.organization_id;
  if (!organizationId) throw new Error("Usuário do app novo não está vinculado a nenhuma organização.");

  console.log("Lendo o app antigo...");
  const [contacts, leads, clients] = await Promise.all([
    fetchAll(OLD, oldToken, "contacts"),
    fetchAll(OLD, oldToken, "leads"),
    fetchAll(OLD, oldToken, "client_profiles"),
  ]);
  console.log(`  contacts.......... ${contacts.length}`);
  console.log(`  leads............. ${leads.length}`);
  console.log(`  client_profiles... ${clients.length}`);
  console.log(`  soma bruta........ ${contacts.length + leads.length + clients.length}`);

  const people = mergePeople({ contacts, leads, clients });
  const byStage = people.reduce((acc, p) => {
    acc[p.lifecycle_stage] = (acc[p.lifecycle_stage] ?? 0) + 1;
    return acc;
  }, {});

  console.log(`\nDepois de fundir: ${people.length} pessoas`);
  console.log(`  contatos.......... ${byStage.contact ?? 0}`);
  console.log(`  oportunidades..... ${byStage.opportunity ?? 0}`);
  console.log(`  clientes.......... ${byStage.client ?? 0}`);
  console.log(`  duplicatas evitadas: ${contacts.length + leads.length + clients.length - people.length}`);

  // Confere o que já quebrou uma vez: se as linhas não tiverem exatamente o
  // mesmo conjunto de chaves, o PostgREST recusa o lote inteiro com PGRST102.
  // Melhor descobrir aqui do que no meio da gravação.
  const signatures = new Set(
    people.map((p) => Object.keys(p).sort().join("|")),
  );
  console.log(`\nFormatos distintos de linha: ${signatures.size}`);
  if (signatures.size !== 1) {
    console.error(
      "As linhas não têm o mesmo conjunto de chaves. A gravação em lote " +
        "falharia com PGRST102. Abortando antes de tocar no banco.",
    );
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log("\nSimulação: nada foi gravado. Rode sem --dry-run para aplicar.");
    return;
  }

  console.log("\nGravando no app novo...");
  let saved = 0;
  const failures = [];

  for (let i = 0; i < people.length; i += 100) {
    const batch = people
      .slice(i, i + 100)
      .map((p) => ({ ...p, organization_id: organizationId }));

    const res = await fetch(
      `${NEW.url}/rest/v1/people?on_conflict=organization_id,legacy_id`,
      {
        method: "POST",
        headers: {
          apikey: NEW.key,
          Authorization: `Bearer ${newToken}`,
          "Content-Type": "application/json",
          // merge-duplicates faz a segunda execução atualizar em vez de falhar.
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify(batch),
      },
    );

    if (res.ok) {
      saved += batch.length;
      process.stdout.write(`  ${saved}/${people.length}\r`);
    } else {
      failures.push(`lote ${i / 100 + 1}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    }
  }

  console.log(`\n\nGravadas: ${saved} de ${people.length}`);
  if (failures.length) {
    console.log(`\n${failures.length} lote(s) falharam:`);
    for (const f of failures) console.log(`  ${f}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(`\nErro: ${err.message}`);
  process.exit(1);
});
