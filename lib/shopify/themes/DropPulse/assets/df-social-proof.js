// DropFlex · <df-social-proof>: pone nombres de personas en la prueba social.
//
// Las reseñas importadas traen autores como «Cliente» o «Anónimo», que no se leen como personas.
// Por eso los nombres no salen de las reseñas: se eligen al azar de estas listas la primera vez
// que se ve el producto y quedan en localStorage['df:social-proof:<id del producto>'], así el
// mismo visitante ve siempre los mismos nombres en ese producto.

if (!customElements.get('df-social-proof')) {
  const WOMEN = [
    'María', 'Camila', 'Valentina', 'Daniela', 'Fernanda', 'Javiera', 'Catalina', 'Constanza',
    'Francisca', 'Sofía', 'Isidora', 'Antonia', 'Paula', 'Carolina', 'Andrea', 'Natalia', 'Gabriela',
    'Paola', 'Claudia', 'Lorena', 'Patricia', 'Verónica', 'Macarena', 'Bárbara', 'Karina', 'Pamela',
    'Alejandra', 'Marcela', 'Carla', 'Tamara', 'Nicole', 'Josefa', 'Florencia', 'Martina', 'Agustina',
    'Trinidad', 'Emilia', 'Ignacia', 'Rocío', 'Lucía', 'Elena', 'Sandra', 'Mónica', 'Cecilia',
    'Soledad', 'Ximena', 'Viviana', 'Romina', 'Belén', 'Ana',
  ];
  const MEN = [
    'Juan', 'José', 'Carlos', 'Luis', 'Jorge', 'Diego', 'Felipe', 'Sebastián', 'Matías', 'Nicolás',
    'Tomás', 'Benjamín', 'Cristóbal', 'Ignacio', 'Francisco', 'Rodrigo', 'Gonzalo', 'Andrés',
    'Pablo', 'Javier', 'Álvaro', 'Eduardo', 'Ricardo', 'Fernando', 'Manuel', 'Alejandro', 'Daniel',
    'Marcelo', 'Mauricio', 'Claudio', 'Patricio', 'Cristián', 'Héctor', 'Raúl', 'Sergio', 'Víctor',
    'Hernán', 'Óscar', 'Gustavo', 'Martín', 'Joaquín', 'Vicente', 'Agustín', 'Maximiliano',
    'Esteban', 'Rafael', 'Samuel', 'Gabriel', 'Emilio', 'Pedro',
  ];
  const NAMES = [...WOMEN, ...MEN];

  const read = (key) => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(saved) ? saved.filter((n) => NAMES.includes(n)) : [];
    } catch {
      return [];
    }
  };

  const write = (key, names) => {
    try {
      localStorage.setItem(key, JSON.stringify(names));
    } catch {
      // Sin localStorage (modo privado): los nombres valen solo para esta visita.
    }
  };

  // Completa los guardados hasta `count` con nombres al azar que no se repitan.
  const pick = (saved, count) => {
    const names = saved.slice(0, count);
    const pool = NAMES.filter((n) => !names.includes(n));
    while (names.length < count && pool.length) {
      names.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    }
    return names;
  };

  class DfSocialProof extends HTMLElement {
    connectedCallback() {
      const key = `df:social-proof:${this.dataset.productId}`;
      const shown = Number(this.dataset.names) || 0;
      const avatars = this.querySelectorAll('.df-social-proof__avatar');
      const count = Math.max(shown, avatars.length);
      const saved = read(key);
      const names = pick(saved, count);
      if (names.length !== saved.length || names.some((n, i) => n !== saved[i])) write(key, names);

      const list = names.slice(0, shown).join(', ');
      this.querySelectorAll('[data-df-names]').forEach((el) => {
        el.textContent = list;
      });
      // Las fotos que faltan muestran la inicial del nombre de su lugar.
      avatars.forEach((el, i) => {
        if (el.hasAttribute('data-df-initial') && names[i]) el.textContent = names[i].charAt(0);
      });
    }
  }

  customElements.define('df-social-proof', DfSocialProof);
}
