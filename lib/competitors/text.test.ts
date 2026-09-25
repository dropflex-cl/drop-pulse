import { describe, expect, it } from "vitest";
import { decodeEntities, extractTitle, htmlToText, ipLiteral, isPrivateAddress, normalizeCompetitorUrl, pageMeta } from "./text";

describe("isPrivateAddress", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.10",
    "169.254.169.254",
    "100.64.0.1",
    "100.127.255.255",
    "0.0.0.0",
    "224.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "fe80::1",
    "fc00::1",
    "fd00:ec2::254",
    "ff02::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "::ffff:10.0.0.1",
    "64:ff9b::a9fe:a9fe",
    "2002:c0a8:0101::1",
    "2001:db8::1",
    "no-es-ip",
  ])("%s es privada", (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });

  it.each(["8.8.8.8", "1.1.1.1", "172.32.0.1", "100.128.0.1", "23.227.38.65", "2606:4700::6810:84e5", "::ffff:8.8.8.8", "2a00:1450:4001:82a::200e"])(
    "%s es pública",
    (ip) => {
      expect(isPrivateAddress(ip)).toBe(false);
    },
  );
});

describe("ipLiteral", () => {
  it("reconoce IPv4, IPv6 y corchetes", () => {
    expect(ipLiteral("1.2.3.4")).toBe("1.2.3.4");
    expect(ipLiteral("[::1]")).toBe("::1");
    expect(ipLiteral("tienda.com")).toBeNull();
  });
});

describe("normalizeCompetitorUrl", () => {
  it("agrega https y quita el fragmento", () => {
    expect(normalizeCompetitorUrl(" tienda.cl/products/serum#reviews ")).toBe("https://tienda.cl/products/serum");
  });
  it("acepta http y https", () => {
    expect(normalizeCompetitorUrl("http://tienda.cl/x")).toBe("http://tienda.cl/x");
    expect(normalizeCompetitorUrl("https://www.tienda.com.co/products/a?variant=1")).toBe("https://www.tienda.com.co/products/a?variant=1");
  });
  it.each([
    "",
    "ftp://tienda.cl/x",
    "javascript:alert(1)",
    "file:///etc/passwd",
    "https://user:pass@tienda.cl/",
    "http://localhost:3000/",
    "http://127.0.0.1/",
    "http://[::1]/",
    "http://169.254.169.254/latest/meta-data",
    "http://intranet/",
    "http://printer.local/",
    "https://tienda .cl",
  ])("rechaza %s", (raw) => {
    expect(normalizeCompetitorUrl(raw)).toBeNull();
  });
});

describe("htmlToText", () => {
  const html = `<!doctype html><html><head><title>Sérum &amp; más</title><style>body{color:red}</style>
    <script>var x = "<p>no</p>";</script></head>
    <body><!-- comentario --><h1>Sérum de colágeno</h1><p>Precio:&nbsp;<b>$24.990</b></p>
    <svg><text>ícono</text></svg><noscript>activa JS</noscript>
    <ul><li>Envío gratis</li><li>Paga al recibir &#8212; sin riesgo &#x2713;</li></ul></body></html>`;

  it("deja solo el texto visible, con saltos por bloque", () => {
    expect(htmlToText(html)).toBe("Sérum de colágeno\nPrecio: $24.990\nEnvío gratis\nPaga al recibir — sin riesgo ✓");
  });

  it("corta en el máximo", () => {
    expect(htmlToText(`<p>${"a".repeat(50)}</p>`, 10)).toBe("a".repeat(10));
  });

  it("decodifica entidades comunes y deja las desconocidas", () => {
    expect(decodeEntities("&iquest;Qu&eacute; &lt;es&gt;? &foo; &#39;x&#39;")).toBe("¿Qué <es>? &foo; 'x'");
  });
});

describe("metadatos", () => {
  const html = `<head><title> Otra </title><meta property="og:title" content="Sérum Pro &amp; Co">
    <meta name="description" content="El mejor sérum">
    <meta property="og:price:amount" content="24990"><meta property="og:price:currency" content="CLP"></head>`;
  it("prefiere og:title", () => {
    expect(extractTitle(html)).toBe("Sérum Pro & Co");
    expect(extractTitle("<title>Solo título</title>")).toBe("Solo título");
    expect(extractTitle("<p>nada</p>")).toBeNull();
  });
  it("arma descripción y precio publicado", () => {
    expect(pageMeta(html)).toBe("Descripción: El mejor sérum\nPrecio publicado: 24990 CLP");
  });
});
