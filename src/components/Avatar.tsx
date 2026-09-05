export function Avatar({ person }: { person: "river" | "forest" }) {
  const river = person === "river";
  return (
    <svg viewBox="0 0 80 80" className={`avatar avatar-${person}`} aria-hidden="true">
      <circle cx="40" cy="40" r="40" fill={river ? "#e5c9a0" : "#b8cebd"} />
      <path d="M10 80c0-21 12-31 30-31s30 10 30 31" fill={river ? "#456e6b" : "#535f53"} />
      <path d="m30 53 10 11 10-11-3-9H33z" fill="#d7a87d" />
      <path d="M22 29c0-17 35-19 36 0v13c-1 13-10 19-18 19s-17-8-18-19z" fill="#f1d0a6" />
      <path d={river ? "M21 35C14 8 59 7 59 33l-8-8c-5 4-15 5-24 3l-3 10z" : "M21 35C16 5 65 10 59 35l-8-10-22 1-6 13z"} fill={river ? "#39413b" : "#d9dfd5"} />
      {!river && <path d="M18 25q22-16 44 0v4H18z" fill="#5b6c5d" />}
      <path d="M28 39h6m12 0h6" stroke="#45443b" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M35 49q5 4 10 0" fill="none" stroke="#a77559" strokeWidth="2" strokeLinecap="round" />
      {!river && <g fill="none" stroke="#6d7369" strokeWidth="1.5"><rect x="25" y="34" width="13" height="10" rx="4"/><rect x="42" y="34" width="13" height="10" rx="4"/><path d="M38 38h4"/></g>}
      <path d="m29 56 11 9-8 8-8-14m27-3-11 9 8 8 8-14" fill={river ? "#abc5b7" : "#d5d7bf"} />
      <path d="M40 66v14" stroke="#253f37" strokeOpacity=".3" />
    </svg>
  );
}
