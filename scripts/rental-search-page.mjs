const origin = 'https://chalezinhoville.com.br';
const catalogURL = origin + '/casas-e-apartamentos.html';
const escape = value => String(value ?? '').replace(/[&<>"']/g, character =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const json = value => JSON.stringify(value).replace(/</g, '\\u003c');
const propertyURL = property => origin + '/imoveis/' + encodeURIComponent(property.slug);

export function rentalMetadata(property) {
  if (!property) return {
    title: 'Apartamentos em Guarapari para temporada | Chalezinho Ville',
    description: 'Aluguel por temporada no Centro e na Praia do Morro. Apartamentos para férias, verão e Réveillon em Guarapari. Consulte datas e disponibilidade.',
    url: catalogURL,
  };
  const name = property.code === 'AP_CENTRO' ? 'Home Office Guarapari · ' + property.name : property.name;
  return {
    title: name + ' | Chalezinho Ville',
    description: (property.summary || property.tagline || name).slice(0, 175),
    url: propertyURL(property),
  };
}

// Both search engines and browsers receive the same current, public PMS projection.
export function renderRentalSearchPage(template, listings, slug = null) {
  const selected = slug ? listings.find(property => property.slug === slug) : null;
  if (slug && !selected) return null;
  const metadata = rentalMetadata(selected);
  const entities = listings.map(property => ({
    '@type': 'Apartment', '@id': propertyURL(property) + '#apartamento',
    name: property.name, url: propertyURL(property),
    ...(property.code === 'AP_CENTRO' ? { alternateName: 'Home Office Guarapari' } : {}),
    description: property.summary || property.tagline,
    image: property.cover_image ? new URL(property.cover_image, origin).href : undefined,
    numberOfBedrooms: property.listing.bedrooms,
    numberOfBathroomsTotal: property.listing.bathrooms,
    occupancy: { '@type': 'QuantitativeValue', maxValue: property.max_guests },
  }));
  const breadcrumbs = [
    { '@type': 'ListItem', position: 1, name: 'Chalezinho Ville', item: origin + '/' },
    { '@type': 'ListItem', position: 2, name: 'Apartamentos em Guarapari', item: catalogURL },
  ];
  if (selected) breadcrumbs.push({
    '@type': 'ListItem', position: 3, name: selected.name, item: propertyURL(selected),
  });
  const graph = [
    { '@type': 'BreadcrumbList', itemListElement: breadcrumbs },
    ...(selected ? [entities.find(entity => entity.url === metadata.url)] : [{
      '@type': 'ItemList',
      itemListElement: listings.map((property, index) => ({
        '@type': 'ListItem', position: index + 1, name: property.name, url: propertyURL(property),
      })),
    }]),
  ];
  let html = template
    .replace(/<title>[\s\S]*?<\/title>/, () => '<title>' + escape(metadata.title) + '</title>')
    .replace(/<meta name="description" content="[^"]*">/, () => '<meta name="description" content="' + escape(metadata.description) + '">')
    .replace(/<link rel="canonical"[^>]*>/g, '');
  html = html.replace('</head>', () =>
    '<link rel="canonical" href="' + escape(metadata.url) + '">' +
    '<meta property="og:type" content="website">' +
    '<meta property="og:title" content="' + escape(metadata.title) + '">' +
    '<meta property="og:description" content="' + escape(metadata.description) + '">' +
    '<meta property="og:url" content="' + escape(metadata.url) + '">' +
    '<script type="application/ld+json">' + json({ '@context': 'https://schema.org', '@graph': graph }) + '</script>' +
    '<script type="application/json" id="rental-catalog-data">' + json({ listings }) + '</script></head>');
  if (selected) {
    const homeOffice = selected.code === 'AP_CENTRO'
      ? '<p>Home Office Guarapari é o apartamento do Centro para combinar sua hospedagem com espaço de trabalho.</p>'
      : '';
    html = html.replace('<p role="status">Carregando imóvel…</p>', () =>
      '<div class="detail-heading"><span class="eyebrow">' + escape(selected.listing.location_label) +
      '</span><h1>' + escape(selected.name) + '</h1></div><section class="detail-copy"><div><h2>' +
      escape(selected.tagline) + '</h2><p>' + escape(selected.summary) + '</p>' + homeOffice +
      '<p>Até ' + Number(selected.max_guests) + ' hóspedes · ' + Number(selected.listing.bedrooms) +
      ' quartos.</p><a class="rental-button" href="#consultar">Consultar datas e disponibilidade</a>' +
      '</div><aside class="detail-notes"><h2>Antes de reservar</h2><p>' +
      escape(selected.listing.notes) + '</p></aside></section>');
  } else {
    html = html.replace('<p role="status">Carregando imóveis…</p>', () => listings.map(property =>
      '<article class="rental-card">' +
      (property.cover_image ? '<a href="' + escape(propertyURL(property)) +
        '"><img class="rental-card-image" src="' + escape(property.cover_image) +
        '" alt="' + escape(property.name) + '" loading="lazy"></a>' : '') +
      '<div class="rental-card-body"><h3><a href="' + escape(propertyURL(property)) + '">' +
      escape(property.name) + '</a></h3><p>' + escape(property.tagline) + '</p><p>Até ' +
      Number(property.max_guests) + ' hóspedes · ' + Number(property.listing.bedrooms) +
      ' quartos.</p><a class="rental-button" href="' + escape(propertyURL(property)) +
      '">Conhecer o imóvel</a></div></article>').join(''));
  }
  return html;
}
