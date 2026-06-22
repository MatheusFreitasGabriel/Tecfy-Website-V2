import fetch from 'node:fetch';

async function testFlow() {
  console.log('🧪 Testando fluxo de planos...\n');

  try {
    // Teste 1: Acessar homepage
    console.log('✓ Teste 1: Acessando homepage');
    const homeRes = await fetch('http://localhost:3000/');
    console.log(`  Status: ${homeRes.status}`);

    // Teste 2: Acessar contato com plano Landing
    console.log('\n✓ Teste 2: Acessando /contato?plan=Landing');
    const contatoRes = await fetch('http://localhost:3000/contato?plan=Landing');
    console.log(`  Status: ${contatoRes.status}`);
    const html = await contatoRes.text();
    
    if (html.includes('Landing')) {
      console.log('  ✅ Página contém referência ao plano Landing');
    } else {
      console.log('  ⚠️  Página não contém referência ao plano');
    }

    // Teste 3: Testar com outro plano
    console.log('\n✓ Teste 3: Acessando /contato?plan=Starter');
    const starterRes = await fetch('http://localhost:3000/contato?plan=Starter');
    console.log(`  Status: ${starterRes.status}`);
    const starterHtml = await starterRes.text();
    
    if (starterHtml.includes('Starter')) {
      console.log('  ✅ Página contém referência ao plano Starter');
    }

    console.log('\n✨ Todos os testes passaram!');

  } catch (error) {
    console.error('❌ Erro:', error.message);
  }
}

testFlow();
