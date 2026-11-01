import Link from "next/link";
export default function Home() {
  return (
    <main className="narrow">
      <h1>Every important document, findable in seconds.</h1>
      <p className="muted">Passports, degrees, insurance, lab reports. Stored privately, searchable, shared only when you choose, and revocable at any time.</p>
      <Link className="btn primary" href="/login">Open your vault</Link>
    </main>
  );
}
