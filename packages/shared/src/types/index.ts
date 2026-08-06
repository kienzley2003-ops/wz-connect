// Barril de tipos compartilhados entre backend, frontend e connect-sdk.
//
// Regra de convivência (ver plano de divisão do MVP): cada frente adiciona
// seus tipos em um arquivo próprio dentro deste diretório
// (ex.: `organization.ts`, `user.ts` para a Frente A;
// `plan.ts`, `subscription.ts` para a Frente B) e reexporta aqui — isso
// reduz colisão de merge neste arquivo a uma linha de export por tipo.
