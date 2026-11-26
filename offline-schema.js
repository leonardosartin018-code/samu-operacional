// Colunas e padrões conferidos no schema público em 19/11/2026.
// Sem credenciais e sem registros operacionais.
export const OFFLINE_SCHEMA = {
  "equipe_ocorrencia": {
    "columns": [
      "id",
      "ocorrencia_id",
      "profissional_id",
      "funcao",
      "confirmado_em",
      "criado_em",
      "legacy_id",
      "nome_snapshot",
      "viatura_id",
      "viatura_snapshot",
      "tipo_escala_no_momento",
      "credito_ocorrencia",
      "observacao",
      "creditou_revezamento",
      "posicao_antes",
      "posicao_depois"
    ],
    "defaults": {
      "criado_em": "$now",
      "creditou_revezamento": false
    }
  },
  "equipe_plantao": {
    "columns": [
      "id",
      "legacy_id",
      "plantao_id",
      "profissional_id",
      "funcao",
      "tipo_escala",
      "viatura_id",
      "status",
      "entrou_em",
      "saiu_em",
      "observacao",
      "grupo_revezamento",
      "ordem_inicial",
      "ocorrencias_validas",
      "ultima_ocorrencia_em",
      "ultimo_retorno_em",
      "pontuacao_revezamento",
      "revezamento_tipo_viatura",
      "origem_escala",
      "titular_profissional_id",
      "nome_titular_escala",
      "tipo_alteracao_escala",
      "ala_escala",
      "turno_escala",
      "saida_prevista_em",
      "criado_em",
      "nome_snapshot",
      "viatura_snapshot",
      "antecipacao_meta_extra",
      "antecipacao_ocorrencias_inicio"
    ],
    "defaults": {
      "ocorrencias_validas": 0,
      "pontuacao_revezamento": 0,
      "criado_em": "$now"
    }
  },
  "escala_interna_plantao": {
    "columns": [
      "id",
      "plantao_id",
      "escala_fixa_id",
      "setor",
      "codigo_posicao",
      "funcao",
      "profissional_id",
      "nome_snapshot",
      "titular_profissional_id",
      "titular_nome_snapshot",
      "tipo_alteracao",
      "status",
      "ordem",
      "observacao",
      "criado_em",
      "atualizado_em"
    ],
    "defaults": {
      "tipo_alteracao": "FIXO",
      "status": "ATIVO",
      "criado_em": "$now",
      "atualizado_em": "$now"
    }
  },
  "livro_plantao": {
    "columns": [
      "id",
      "plantao_id",
      "parte_diaria",
      "ano",
      "chefe_servico",
      "radio_1_profissional_id",
      "radio_1_nome_snapshot",
      "radio_2_profissional_id",
      "radio_2_nome_snapshot",
      "observacoes",
      "texto_responsabilidade",
      "texto_transmissao",
      "status",
      "atualizado_por",
      "criado_em",
      "atualizado_em"
    ],
    "defaults": {
      "texto_responsabilidade": "*OBS: A responsabilidade pelo fechamento e por salvar o livro é do rádio operador do 2º horário.",
      "texto_transmissao": "Faço ao meu substituto legal a quem transmito todas ordens em vigor, bem como todas as alterações verificadas no decorrer do serviço.",
      "status": "RASCUNHO",
      "criado_em": "$now",
      "atualizado_em": "$now"
    }
  },
  "ocorrencias": {
    "columns": [
      "id",
      "legacy_id",
      "plantao_id",
      "viatura_id",
      "numero",
      "natureza",
      "endereco",
      "bairro",
      "destino",
      "status",
      "acionada_em",
      "saida_em",
      "chegada_qth_em",
      "inicio_retorno_em",
      "retorno_base_em",
      "qta_em",
      "observacao",
      "criado_em",
      "viatura_snapshot",
      "base_snapshot",
      "data_ocorrencia",
      "destino_ou_local",
      "tipo_ocorrencia",
      "duracao_min",
      "ocorrencia_longa",
      "criado_por",
      "finalizado_por",
      "finalizado_em",
      "criterio_prioridade",
      "motivo_prioridade",
      "notificar_equipe",
      "tempo_base_antes_min",
      "creditou_revezamento",
      "peso_ocorrencia",
      "qth_nao_informado"
    ],
    "defaults": {
      "criado_em": "$now",
      "ocorrencia_longa": false,
      "notificar_equipe": false,
      "creditou_revezamento": false,
      "qth_nao_informado": false
    }
  },
  "plantoes": {
    "columns": [
      "id",
      "repasse_plantao",
      "legacy_id",
      "data_plantao",
      "turno",
      "ala",
      "status",
      "iniciado_em",
      "encerrado_em",
      "observacao",
      "criado_em",
      "tipo_plantao",
      "operador_abertura",
      "operador_encerramento",
      "relatorio_enviado",
      "email_relatorio",
      "criterio_usb_condutor",
      "criterio_usb_tecnico",
      "criterio_usa_equipe",
      "criterio_usa_condutor",
      "criterio_usa_enfermeiro",
      "obs_revezamento",
      "escala_operacional_confirmada_em",
      "escala_operacional_confirmada_por",
      "escala_interna_confirmada_em",
      "escala_interna_confirmada_por"
    ],
    "defaults": {
      "status": "ABERTO",
      "criado_em": "$now",
      "relatorio_enviado": false
    }
  },
  "prioridade_manual_revezamento": {
    "columns": [
      "id",
      "plantao_id",
      "grupo",
      "equipe_plantao_id",
      "viatura_id",
      "posicao",
      "criado_em"
    ],
    "defaults": {
      "criado_em": "$now"
    }
  },
  "profissionais": {
    "columns": [
      "id",
      "legacy_id",
      "nome_completo",
      "nome_de_guerra",
      "nome_exibicao",
      "nomes_anteriores",
      "funcao_sistema",
      "funcoes_habilitadas",
      "categoria_origem",
      "topico_ntfy",
      "telegram_chat_id",
      "canal_notificacao",
      "notificar_padrao",
      "ativo",
      "data_cadastro",
      "atualizado_em",
      "observacao",
      "criado_em",
      "alterado_em"
    ],
    "defaults": {
      "funcoes_habilitadas": [],
      "notificar_padrao": false,
      "ativo": true,
      "criado_em": "$now",
      "alterado_em": "$now"
    }
  },
  "viaturas": {
    "columns": [
      "id",
      "legacy_id",
      "codigo",
      "nome",
      "tipo",
      "base_id",
      "ativo",
      "observacao",
      "criado_em",
      "status_atual",
      "ordem_exibicao",
      "grupo_layout",
      "participa_revezamento"
    ],
    "defaults": {
      "ativo": true,
      "criado_em": "$now",
      "participa_revezamento": false
    }
  }
};
