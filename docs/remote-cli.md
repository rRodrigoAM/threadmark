# CLI remota por SSH

A CLI pode encaminhar somente operações headless para uma instância Threadmark que roda em um container Docker acessível por um alias SSH local. Ela não cria servidores, não instala chaves, não copia credenciais e não configura a instância remota.

## Cadastro local

Cadastre um nome de destino, um alias já existente em `~/.ssh/config` e o nome exato do container:

```sh
threadmark remote add production --ssh threadmark-prod --container threadmark-production
threadmark remote list --json
```

O cadastro contém apenas `name`, `ssh` e `container`. Por padrão ele fica em:

- `$XDG_CONFIG_HOME/threadmark/remotes.json`, quando `XDG_CONFIG_HOME` contém um caminho absoluto;
- `~/.config/threadmark/remotes.json`, caso contrário.

O arquivo é gravado com modo `0600`; o diretório dedicado criado pela CLI usa modo `0700`. `THREADMARK_REMOTE_CONFIG_PATH` é uma substituição para testes e integrações locais isoladas. `threadmark remote remove NAME` remove apenas esse registro local — nunca conecta ao servidor nem remove um container.

### Lock de edição e recuperação manual

Alterações no cadastro usam o diretório de lock `${caminho-do-arquivo}.lock` e falham fechadas após dois segundos se ele já existir. Um processo encerrado abruptamente pode deixar esse diretório para trás. O erro `remote_config_busy` informa o caminho exato; não há remoção automática, takeover por TTL ou comando de desbloqueio.

Antes de remover um lock, **verifique primeiro que nenhuma edição de registro usando este arquivo está ativa** — não pode haver um `threadmark remote add` ou `threadmark remote remove` em andamento. Listagens, leituras de registro (`remote list` e `getRemote`) e operações remotas headless continuam disponíveis enquanto uma edição do cadastro estiver bloqueada.

Depois dessa verificação, remova **somente** o diretório de lock vazio com `rmdir`, usando o caminho correto:

- se `THREADMARK_REMOTE_CONFIG_PATH` estiver definido, use `${THREADMARK_REMOTE_CONFIG_PATH}.lock` (a CLI resolve um override relativo a partir do diretório de onde ela foi executada);
- caso contrário, se `XDG_CONFIG_HOME` contiver um caminho absoluto, use `$XDG_CONFIG_HOME/threadmark/remotes.json.lock`;
- caso contrário, use `~/.config/threadmark/remotes.json.lock`.

Por exemplo, depois de confirmar que não há editor ativo:

```sh
rmdir -- "/caminho/exato/para/remotes.json.lock"
```

`rmdir` deve falhar se o diretório não estiver vazio. **Nunca use `rm -rf` e nunca remova um lock de um processo ativo.**

Use aliases SSH para manter host, usuário e chave no cliente local. Não inclua senha, token, `usuario@host`, flags SSH ou dados de credencial no registro.

## Uso

O seletor remoto deve ser o prefixo único da chamada:

```sh
threadmark --remote production tickets list --json
threadmark --remote production conversations list --limit 25 --json
threadmark --remote production tickets status ticket-123 \
  --input update.json --apply --as "Pessoa Operadora" --client hermes --json
```

A última chamada lê `update.json` no computador que invocou a CLI e o encaminha pela entrada padrão ao container como `--input -`; o caminho local nunca é enviado ao host remoto. A entrada é limitada a 64 KiB. `--input -` encaminha a entrada padrão local diretamente. Escritas continuam exigindo `--apply`, `--as` e, quando aplicável, `--client`; a instância remota mantém a mesma resolução de ator e auditoria headless.

São aceitas as famílias headless: `capabilities`, `operators`, `conversations`, `triage`, `tickets`, `categories`, `clients`, `dashboard` e `agent`. A CLI rejeita explicitamente comandos de ciclo de vida ou dados locais, como `on`, `off`, `start`, `stop`, `restore`, `service`, `backup`, `backups`, `configure` e similares. Não há fallback automático para a instância local quando um remoto não existe ou falha.

## Transporte e limites

A chamada remota executa, por SSH, o equivalente seguro a:

```text
docker exec -i <container-configurado> node /app/bin/threadmark.mjs <comando-headless...>
```

Cada argumento é citado para POSIX e `ssh` é iniciado sem shell local. O transporte usa modo não interativo, verificação estrita de chave do host, uma única tentativa de conexão, timeout de conexão e keepalive limitado; encaminhamento de agente e outros encaminhamentos são desativados. `ProxyJump`, `IdentityFile` e demais escolhas já confiadas ao alias em `~/.ssh/config` continuam disponíveis.

O nome do container é exato. Recriações do Coolify ou do Docker podem mudar esse nome; atualize o registro local se isso acontecer. A CLI não tenta descobrir, escolher ou iniciar outro container. Não repete automaticamente uma chamada que falhou, inclusive escritas ambíguas. Saída padrão JSON e código de saída do comando remoto são preservados; com `--json`, falhas de transporte também usam um envelope JSON de erro quando não houver um erro headless já produzido pelo container.

Esta integração **não é um sandbox SSH** nem garante uma conta remota restrita. Restrinja o alias e as permissões do host/Docker de acordo com a política da operação. O uso correto depende de chaves, `known_hosts`, conta e daemon Docker protegidos fora do Threadmark.
