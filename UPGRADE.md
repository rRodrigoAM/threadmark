# Atualização, rollback e remoção

Threadmark pode rodar em um container stateful no Coolify ou diretamente pelo código-fonte. Em ambos os casos, aplicação e dados ficam separados: substituir a imagem ou atualizar o clone não remove o conteúdo de `SUPPORT_DATA_DIR`.

## Antes de atualizar

1. Confirme que `GET /health` responde e que o workspace abre normalmente.
2. Crie um backup completo em **Configurações → Dados** ou pela CLI e valide o resultado:

   ```bash
   threadmark backup --full
   threadmark backups list
   ```

3. Confirme que existe apenas uma réplica e que o deploy não sobrepõe a instância antiga com a nova.

O backup integrado inclui SQLite, configurações não secretas e, no modo completo, anexos. Ele não inclui sessão do WhatsApp, chaves externas nem credenciais de ferramentas. O cache dos modelos locais de transcrição também não entra no backup.

## Aposentadoria do Threadmark AI

O chat, executor Codex interno, providers, ferramentas locais e endpoints exclusivos foram removidos. A triagem semântica agora depende do Hermes pela CLI headless; sem um consumidor externo, os jobs aguardam. Use `SUPPORT_TRIAGE_AI_ENABLED=false` apenas para escolher o classificador determinístico local. As opções `SUPPORT_AGENT_EXECUTOR`, `SUPPORT_AGENT_ENABLED`, `SUPPORT_AGENT_CONCURRENCY` e `SUPPORT_CODEX_MCP_TOOL_LOOP_ENABLED` não selecionam mais um executor.

Esta atualização não descarta tabelas nem conversas históricas. Migrações antigas permanecem para abrir e atualizar bancos existentes; tickets criados anteriormente continuam operacionais. Não é necessária uma migração destrutiva para aposentar o runtime. Qualquer remoção física dos dados deve ser uma operação separada, explicitamente autorizada e precedida por backup validado.

## Atualizar no Coolify

1. Faça o deploy da nova revisão usando o mesmo volume em `/app/data`.
2. Interrompa a instância antiga antes de iniciar a nova; duas instâncias não podem abrir o mesmo SQLite nem compartilhar a mesma sessão do WhatsApp.
3. Aguarde o health check em `/health`.
4. Confirme login, tickets, anexos, automações, workers e conexão do WhatsApp.
5. Verifique os logs de migração antes de considerar a atualização concluída.

Migrações pendentes são aplicadas no primeiro início e criam um snapshot versionado do SQLite antes da alteração. Não interrompa essa inicialização.

## Atualizar uma instalação pelo código-fonte

No diretório do repositório:

```bash
threadmark off
git pull --ff-only
npm ci
npm run build
npm link
threadmark on
threadmark doctor
```

Revise o histórico de commits e as mudanças de schema antes de atualizar.

## Reverter uma atualização

1. Pare completamente o Threadmark.
2. Localize e valide o backup completo ou pré-migração.
3. Restaure o backup compatível com a versão anterior.
4. Volte para a imagem ou tag conhecida.
5. Inicie uma única instância e valide saúde, login, SQLite, anexos e WhatsApp.

Não tente reverter migrações editando o SQLite manualmente. Reutilizar uma imagem anterior sobre um banco já migrado não é um rollback seguro sem compatibilidade explícita.

## Snapshot para migração

Um snapshot parado do diretório inteiro preserva também sessão do WhatsApp e cofre local e, por isso, é altamente sensível.

1. Pare a instalação de origem.
2. Confirme o caminho efetivo de `SUPPORT_DATA_DIR`.
3. Copie o diretório inteiro para um destino criptografado, preservando permissões e arquivos ocultos.
4. Restaure em `/app/data` com o container parado.
5. Inicie somente uma instância e valide o resultado.

Não copie apenas `threadmark.sqlite`: banco, WAL/SHM, anexos, auth e arquivos auxiliares formam a fronteira de persistência.

## Remover preservando dados

No Coolify, remova a aplicação sem remover o volume persistente. Pelo código-fonte:

```bash
threadmark off
threadmark service uninstall
npm unlink --global threadmark
```

O LaunchAgent é opcional e exclusivo da instalação local no macOS. Esses comandos não removem o clone nem `SUPPORT_DATA_DIR`.

## Apagar instalação e dados

Exclua o volume ou diretório de dados somente após confirmar retenção, backup e escopo. A remoção apaga mensagens, anexos, sessão do WhatsApp, credenciais locais e auditoria e não pode ser desfeita sem backup válido.
