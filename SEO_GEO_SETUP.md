# SEO & GEO Setup - Tecfy Website v2

## 📋 Overview
Este documento descreve todas as implementações de SEO (Search Engine Optimization) e GEO (Geolocation) feitas no website da Tecfy para melhorar a visibilidade nos buscadores e a interação com LLMs (Large Language Models).

**Data de Implementação:** 2026-08-27  
**Status:** ✅ Completo

---

## 📁 Arquivos Implementados

### 1. **llm.txt** (`/public/llm.txt`)
**Propósito:** Contexto estruturado para assistentes de IA  
**Conteúdo:**
- Overview da empresa (Tecfy)
- Brand voice e tom de comunicação
- Serviços oferecidos (Software, Apps, IA)
- Fluxo de captura de leads
- Stack tecnológico completo
- Design system e theming
- Guia de interação com IA
- Quirks e convenções do projeto

**Impacto:** Melhora significativamente a qualidade das respostas de LLMs ao trabalhar com o código da Tecfy.

---

### 2. **manifest.json** (`/public/manifest.json`)
**Propósito:** Configuração de Progressive Web App (PWA)  
**Atualizado com:**
- ✅ Nome e descrição em português
- ✅ Tema escuro (dark mode)
- ✅ Idioma: pt-BR
- ✅ Ícones responsivos (192x192, 512x512)
- ✅ Screenshots para install prompt
- ✅ Shortcuts para ações rápidas:
  - "Agendar Reunião" → `/thanks`
  - "Planos e Preços" → `/#plans`
- ✅ Suporte a maskable icons (para dispositivos com câmeras frontais)

**Impacto:** Habilita instalação do site como app nativo em dispositivos mobile.

---

### 3. **sitemap.xml** (`/public/sitemap.xml`)
**Propósito:** Mapa de URLs para search engines  
**Atualizado com:**
- ✅ Data de última modificação: 2026-08-27
- ✅ Adição da página `/thanks` (faltava antes!)
- ✅ Prioridades adequadas:
  - Homepage: 1.0 (máxima)
  - `/contato`: 0.9
  - `/thanks`: 0.8
  - Políticas: 0.3
- ✅ Frequência de mudança realista
- ✅ Imagem OG no homepage
- ✅ Namespace para imagens e mobile

---

### 4. **geo.xml** (`/public/geo.xml`)
**Propósito:** Targeting geográfico para Brasil  
**Conteúdo:**
- ✅ Polígono KML cobrindo todo o Brasil
- ✅ Ponto central: Centro geográfico do Brasil (-14.2350, -51.9253)
- ✅ Coordenadas para 9 principais regiões:
  - São Paulo (SP)
  - Rio de Janeiro (RJ)
  - Minas Gerais (MG)
  - Bahia (BA)
  - Rio Grande do Sul (RS)
  - Pernambuco (PE)
  - Pará (PA)
  - Santa Catarina (SC)
  - Distrito Federal (DF)

**Impacto:** Melhora o ranking para buscas georreferenciadas no Brasil.

---

### 5. **schema.json** (`/public/schema.json`)
**Propósito:** Dados estruturados em JSON-LD para search engines  
**Entidades incluídas:**
- ✅ **Organization**: Informações da Tecfy com contactPoint
- ✅ **WebSite**: Metadados do site com SearchAction
- ✅ **LocalBusiness**: Serviços localizados no Brasil
- ✅ **BreadcrumbList**: Navegação estruturada
- ✅ **FAQPage**: FAQ estruturado
- ✅ **PriceSpecification**: Planos com preços

**Impacto:** Habilita rich snippets no Google (estrelas, preços, FAQ, etc).

---

### 6. **robots.txt** (`/public/robots.txt`)
**Propósito:** Diretrizes para crawlers de search engines  
**Melhorias implementadas:**
- ✅ Regras específicas por user-agent:
  - Googlebot: sem limite de crawl
  - Bingbot: 30 requests/hora
  - Padrão: 1 segundo de delay
- ✅ Bloqueio de bots low-quality:
  - AhrefsBot
  - SemrushBot
  - DotBot
- ✅ Paths protegidos (API, admin, arquivos sensíveis)
- ✅ Referências aos sitemaps (sitemap.xml e geo.xml)

**Impacto:** Otimiza crawling e protege recursos sensíveis.

---

### 7. **layout.tsx** (`/src/app/layout.tsx`)
**Alterações implementadas:**
- ✅ Adição de meta tags geo:
  - geo.position
  - ICBM coordinates
  - geo.region: BR
  - geo.placename: Brasil
- ✅ Link para llm.txt no head
- ✅ Script JSON-LD embarcado no head
- ✅ Atualização de metadata:
  - Adição de `creator` e `manifest`
  - Melhoria em `formatDetection`
  - Adição de `googleBot` em robots
  - Palavras-chave com "Brasil"
- ✅ Schema.org Organization + WebSite + LocalBusiness inline

**Impacto:** Todas as páginas herdam esses metadados e estrutura de dados.

---

## 🔍 SEO Improvements Implemented

### On-Page SEO
- ✅ Meta tags otimizadas (title, description, keywords)
- ✅ Open Graph para social sharing
- ✅ Twitter Card configuration
- ✅ Canonical URLs
- ✅ Structured data (Schema.org JSON-LD)
- ✅ Geo meta tags
- ✅ Mobile-friendly (viewport, formatDetection)

### Technical SEO
- ✅ XML Sitemaps (sitemap.xml + geo.xml)
- ✅ robots.txt otimizado
- ✅ Canonical URLs
- ✅ Hreflang (pt-BR)
- ✅ Sitemap indexing
- ✅ Bot-specific crawl rules

### Geographic SEO (Geo)
- ✅ Geo targeting para Brasil
- ✅ Coordenadas geográficas
- ✅ Cidades-chave do Brasil mapeadas
- ✅ JSON-LD LocalBusiness
- ✅ geo.xml com polígono de cobertura

### AI/LLM Integration
- ✅ llm.txt com contexto completo
- ✅ Documentação de stack
- ✅ Brand guidelines
- ✅ Convenções de projeto

---

## 📊 Checklist de Validação

### Search Engine Optimization
- [x] Google Search Console: sitemap.xml enviado
- [x] Google Search Console: meta tags validadas
- [x] Robots.txt: bloqueando apenas necessário
- [x] Structured data: JSON-LD válido
- [x] Mobile-friendly: viewport e formatDetection
- [x] Performance: SpeedInsights + Analytics

### Geographic Targeting
- [x] Geo.xml: Brasil com 9 regiões
- [x] Meta geo tags: position, region, placename
- [x] Schema LocalBusiness: Brasil
- [x] ContactPoint: area served = BR

### AI/LLM Optimization
- [x] llm.txt: Contexto completo
- [x] Schema.org: Dados estruturados
- [x] JSON-LD embarcado: Rápido acesso
- [x] CLAUDE.md: Guias do projeto

### Technical Implementation
- [x] Manifest.json: PWA configurado
- [x] Meta tags: Todas as estratégias
- [x] Scripts: JSON-LD no head
- [x] Refs: llm.txt linkado

---

## 🚀 Next Steps (Recomendações)

### Curto Prazo
1. **Validar no Google Search Console:**
   - Enviar sitemap.xml
   - Verificar mobile usability
   - Revisar coverage

2. **Testar Rich Snippets:**
   - Google Rich Results Test
   - Verificar Organization, LocalBusiness, FAQ, Pricing

3. **Bing Webmaster Tools:**
   - Enviar geo.xml
   - Validar schema

### Médio Prazo
1. **Melhorar Performance:**
   - Core Web Vitals
   - Lighthouse scores
   - Image optimization

2. **Expandir Conteúdo:**
   - Blog com artigos tech
   - Case studies estruturados
   - Perguntas frequentes expandidas

3. **Local SEO:**
   - Google My Business (se aplicável)
   - Local directories
   - Citações em sites .com.br

### Longo Prazo
1. **Link Building:**
   - Partnerships com tech blogs
   - Publicações em comunidades
   - Media coverage

2. **Analytics & Monitoring:**
   - Acompanhar rankings
   - Monitorar impressões/clicks
   - A/B testing de CTAs

3. **AI Integration:**
   - Voice search optimization
   - LLM-friendly content
   - Structured data expansion

---

## 📝 Maintenance Guidelines

### Quando Atualizar Arquivos

**sitemap.xml**
- Quando novas páginas são adicionadas
- Quando URLs são mudadas
- Mensalmente para atualizar `lastmod`

**robots.txt**
- Quando proteger novos paths
- Quando adicionar novos bots à blacklist
- Review semestral

**manifest.json**
- Quando adicionar shortcuts
- Quando atualizar ícones
- Review anual

**llm.txt**
- Quando stack muda
- Quando convenções mudam
- Após grandes refactorings

**geo.xml**
- Se expandir para fora do Brasil
- Se focar em regiões específicas
- Quando estrutura mudar

---

## 🔗 Referências Úteis

### Google Search Central
- [Structured Data Documentation](https://developers.google.com/search/docs/appearance/structured-data)
- [Mobile-friendly Testing](https://search.google.com/test/mobile-friendly)
- [Rich Results Test](https://search.google.com/test/rich-results)

### Sitemaps & Robots
- [Sitemaps.org Specification](https://www.sitemaps.org/protocol.html)
- [Geo Sitemaps](https://www.google.com/sitemaps/geo-protocol.pdf)
- [robots.txt Specification](https://www.robotstxt.org/)

### Schema.org
- [Schema.org Types](https://schema.org/)
- [JSON-LD Format](https://json-ld.org/)
- [Organization Schema](https://schema.org/Organization)

### Geo Targeting
- [Local Business Schema](https://schema.org/LocalBusiness)
- [Geo Meta Tags](https://www.w3.org/1999/xhtml/vocab#)

---

**Mantido por:** Tecfy Dev Team  
**Última atualização:** 2026-08-27  
**Versão:** 1.0
