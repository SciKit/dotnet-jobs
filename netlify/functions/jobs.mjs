// Fetches .NET jobs from several sources, keeps only non-Asia jobs.
// Free sources need no key: Remotive, Arbeitnow, RemoteOK, Jobicy.
// Optional keys (Netlify env vars): ADZUNA_APP_ID + ADZUNA_APP_KEY, UPWORK_TOKEN.

const DOTNET = /(\.net\b|dotnet|asp\s?\.?net|c#|csharp|blazor|\bmaui\b|xamarin|entity framework|\bef core\b|\bwpf\b|\bwinforms\b|umbraco|sitecore)/i;

const DOTNET_G = new RegExp(DOTNET.source, "gi");

const ASIA = [
  "asia", "apac", "india", "china", "japan", "korea", "singapore", "malaysia", "indonesia",
  "philippines", "thailand", "vietnam", "pakistan", "bangladesh", "sri lanka", "nepal",
  "hong kong", "taiwan", "cambodia", "myanmar", "laos", "mongolia", "kazakhstan", "uzbekistan",
  "kyrgyzstan", "tajikistan", "turkmenistan", "afghanistan", "bhutan", "maldives", "brunei",
  "uae", "united arab emirates", "dubai", "abu dhabi", "saudi", "qatar", "kuwait", "bahrain",
  "oman", "jordan", "lebanon", "iraq", "iran", "israel", "yemen", "syria",
  "bangalore", "bengaluru", "hyderabad", "pune", "chennai", "mumbai", "delhi", "noida",
  "gurgaon", "gurugram", "ahmedabad", "kolkata", "karachi", "lahore", "dhaka", "manila",
  "jakarta", "kuala lumpur", "bangkok", "ho chi minh", "hanoi", "shanghai", "beijing",
  "shenzhen", "tokyo", "seoul", "tel aviv", "riyadh", "doha"
];
const ASIA_RE = new RegExp("\\b(" + ASIA.join("|") + ")\\b", "i");

const EUROPE = /(europe|nederland|schweiz|suisse|svizzera|österreich|osterreich|españa|belgië|belgique|polska|sverige|norge|danmark|suomi|italia|česko|holland|utrecht|zuid-holland|noord-holland|eindhoven|den haag|luzern|bern|basel|geneva|genève|\beu\b|emea|united kingdom|\buk\b|england|scotland|ireland|germany|deutschland|france|spain|portugal|italy|netherlands|belgium|luxembourg|switzerland|austria|poland|czech|slovakia|hungary|romania|bulgaria|greece|croatia|serbia|slovenia|bosnia|albania|macedonia|montenegro|moldova|ukraine|lithuania|latvia|estonia|finland|sweden|norway|denmark|iceland|cyprus|malta|london|berlin|munich|münchen|hamburg|frankfurt|köln|cologne|stuttgart|düsseldorf|paris|madrid|barcelona|lisbon|amsterdam|rotterdam|brussels|zurich|zürich|vienna|wien|warsaw|krakow|prague|budapest|bucharest|stockholm|oslo|copenhagen|helsinki|dublin|manchester|edinburgh|milan|rome)/i;
const USA_WORDS = /(\busa\b|u\.s\.|united states|america|new york|california|texas|florida|chicago|seattle|boston|atlanta|denver|austin|dallas|houston|san francisco|los angeles|phoenix)/i;
const USA = /(\bUS\b|\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\b|new york|california|texas|florida|chicago|seattle|boston|atlanta|denver|austin|dallas|houston|san francisco|los angeles|phoenix)/;
const ANYWHERE = /(worldwide|anywhere|global|remote$|^remote\b|^$)/i;

function region(loc) {
  const l = (loc || "").trim();
  if (USA_WORDS.test(l)) return "USA";
  if (EUROPE.test(l)) return "Europe";
  if (USA.test(l)) return "USA";
  if (ANYWHERE.test(l)) return "Worldwide";
  return "Other";
}

const strip = (s) => (s || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

async function getJSON(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(url, { ...opts, signal: ctrl.signal, headers: { "User-Agent": "dotnet-jobs-board/1.0", ...(opts.headers || {}) } });
    if (!r.ok) throw new Error(url + " -> " + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

const sources = {
  async remotive() {
    const d = await getJSON("https://remotive.com/api/remote-jobs?search=.net&limit=200");
    return (d.jobs || []).map((j) => ({
      title: j.title, company: j.company_name, location: j.candidate_required_location,
      url: j.url, date: j.publication_date, type: j.job_type, salary: j.salary,
      tags: (j.tags || []).join(" ") + " " + strip(j.description).slice(0, 4000), source: "Remotive", kind: "Job"
    }));
  },
  async arbeitnow() {
    const out = [];
    const pages = await Promise.allSettled([1,2,3,4,5,6,7,8,9,10].map((p) => getJSON("https://www.arbeitnow.com/api/job-board-api?page=" + p)));
    for (const pr of pages) {
      if (pr.status !== "fulfilled") continue;
      for (const j of pr.value.data || []) out.push({
        title: j.title, company: j.company_name, location: j.location + (j.remote ? " (Remote)" : ""),
        url: j.url, date: new Date(j.created_at * 1000).toISOString(), type: (j.job_types || []).join(", "),
        tags: (j.tags || []).join(" ") + " " + strip(j.description).slice(0, 4000), source: "Arbeitnow", kind: "Job"
      });
    }
    return out;
  },
  async remoteok() {
    const d = await getJSON("https://remoteok.com/api?tag=dotnet");
    return (Array.isArray(d) ? d : []).filter((j) => j.position).map((j) => ({
      title: j.position, company: j.company, location: j.location || "Worldwide",
      url: j.url || j.apply_url, date: j.date,
      salary: j.salary_min ? `$${j.salary_min} - $${j.salary_max}` : "",
      tags: (j.tags || []).join(" ") + " dotnet", source: "RemoteOK", kind: "Job"
    }));
  },
  async jobicy() {
    const d = await getJSON("https://jobicy.com/api/v2/remote-jobs?count=100&tag=.net");
    return (d.jobs || []).map((j) => ({
      title: j.jobTitle, company: j.companyName, location: j.jobGeo,
      url: j.url, date: j.pubDate, type: (j.jobType || []).join?.(", ") || j.jobType,
      salary: j.annualSalaryMin ? `${j.annualSalaryMin} - ${j.annualSalaryMax} ${j.salaryCurrency || ""}` : "",
      tags: strip(j.jobExcerpt) + " " + strip(j.jobDescription).slice(0, 4000), source: "Jobicy", kind: "Job"
    }));
  },
  async himalayas() {
    const pages = await Promise.allSettled([0, 100, 200, 300, 400].map((o) => getJSON("https://himalayas.app/jobs/api?limit=100&offset=" + o)));
    return pages.flatMap((pr) => pr.status !== "fulfilled" ? [] : (pr.value.jobs || []).map((j) => ({
      title: j.title, company: j.companyName,
      location: (j.locationRestrictions || []).join(", ") || "Worldwide",
      url: j.applicationLink || j.guid, date: j.pubDate ? new Date(j.pubDate * 1000).toISOString() : "",
      salary: j.minSalary ? `${j.minSalary} - ${j.maxSalary} ${j.currency || ""}` : "",
      tags: (j.categories || []).join(" ") + " " + strip(j.excerpt) + " " + strip(j.description).slice(0, 4000),
      source: "Himalayas", kind: "Job"
    })));
  },
  async themuse() {
    const pages = await Promise.allSettled([0,1,2,3,4,5,6,7,8,9].map((p) => getJSON("https://www.themuse.com/api/public/jobs?category=Software%20Engineering&page=" + p)));
    return pages.flatMap((pr) => pr.status !== "fulfilled" ? [] : (pr.value.results || []).map((j) => ({
      title: j.name, company: j.company?.name,
      location: (j.locations || []).map((l) => l.name).join("; ") || "Remote",
      url: j.refs?.landing_page, date: j.publication_date,
      tags: strip(j.contents).slice(0, 6000), source: "The Muse", kind: "Job"
    })));
  },
  async adzuna() {
    const id = process.env.ADZUNA_APP_ID, key = process.env.ADZUNA_APP_KEY;
    if (!id || !key) return [];
    const NAMES = { us:"USA", gb:"United Kingdom", de:"Germany", fr:"France", nl:"Netherlands", pl:"Poland", it:"Italy", es:"Spain", at:"Austria", be:"Belgium", ch:"Switzerland", ca:"Canada", au:"Australia", nz:"New Zealand", br:"Brazil", mx:"Mexico", za:"South Africa" };
    const countries = ["us", "gb", "de", "fr", "nl", "pl", "it", "es", "at", "be", "ch", "ca", "au", "nz", "br", "mx", "za"];
    const reqs = countries.flatMap((c) => [1, 2].map((pg) => [c, pg]));
    const res = await Promise.allSettled(reqs.map(([c, pg]) =>
      getJSON(`https://api.adzuna.com/v1/api/jobs/${c}/search/${pg}?app_id=${id}&app_key=${key}&results_per_page=50&what_or=.net%20dotnet%20c%23%20asp.net%20blazor&max_days_old=30&content-type=application/json`)
        .then((d) => (d.results || []).map((j) => ({
          title: strip(j.title), company: j.company?.display_name, location: (j.location?.display_name || "") + ", " + NAMES[c],
          url: j.redirect_url, date: j.created, type: j.contract_time,
          salary: j.salary_min ? `${Math.round(j.salary_min)} - ${Math.round(j.salary_max)}` : "",
          tags: strip(j.description), trusted: true, source: "Adzuna", kind: "Job"
        })))
    ));
    return res.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  },
  async upwork() {
    const token = process.env.UPWORK_TOKEN;
    if (!token) return [];
    const query = `query { marketplaceJobPostingsSearch(
        marketPlaceJobFilter: { searchExpression_eq: ".NET OR C# OR ASP.NET OR Blazor" }
        searchType: USER_JOBS_SEARCH
        sortAttributes: [{ field: RECENCY }]
      ) { edges { node { id title ciphertext createdDateTime
            amount { displayValue } hourlyBudgetMin { displayValue } hourlyBudgetMax { displayValue }
            client { location { country } } } } } }`;
    const d = await getJSON("https://api.upwork.com/graphql", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ query })
    });
    const edges = d?.data?.marketplaceJobPostingsSearch?.edges || [];
    return edges.map(({ node: n }) => ({
      title: n.title, company: "Upwork client", location: n.client?.location?.country || "",
      url: "https://www.upwork.com/jobs/" + n.ciphertext, date: n.createdDateTime,
      salary: n.amount?.displayValue && n.amount.displayValue !== "0.0" ? n.amount.displayValue
        : n.hourlyBudgetMin ? `${n.hourlyBudgetMin.displayValue}-${n.hourlyBudgetMax?.displayValue}/hr` : "",
      tags: "dotnet", source: "Upwork", kind: "Freelance"
    }));
  }
};

export default async () => {
  const names = Object.keys(sources);
  const results = await Promise.allSettled(names.map((n) => sources[n]()));
  const status = {};
  let all = [];
  results.forEach((r, i) => {
    status[names[i]] = r.status === "fulfilled" ? r.value.length : "error: " + String(r.reason?.message || r.reason).slice(0, 120);
    if (r.status === "fulfilled") all = all.concat(r.value);
  });

  const seen = new Set();
  const jobs = all
    .filter((j) => j.title && j.url)
    .filter((j) => DOTNET.test(j.title) || (j.trusted && DOTNET.test(j.tags || "")) || ((j.tags || "").match(DOTNET_G) || []).length >= 3)
    .filter((j) => !ASIA_RE.test(j.location || ""))
    .map((j) => ({ ...j, title: strip(j.title), region: region(j.location), tags: undefined, trusted: undefined }))
    .filter((j) => { const k = (j.title + "|" + j.company).toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  return new Response(JSON.stringify({ updated: new Date().toISOString(), status, jobs }), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300",
      "Netlify-CDN-Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600"
    }
  });
};

export const config = { path: "/api/jobs" };
