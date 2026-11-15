-- Segurança mínima para ocorrências com informações clínicas importadas.
-- Mantém leitura para qualquer perfil ATIVO cadastrado (inclusive perfis de consulta).
-- Impede que uma conta recém-registrada, sem aprovação, consulte ocorrências.
-- Não altera as permissões de gravação de RADIO_OPERADOR / ADMIN.
-- Reaplicar em outros ambientes após backup e revisão de políticas.
ALTER POLICY "autenticados leem ocorrencias"
  ON public.ocorrencias
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios_perfis AS usuario
      WHERE usuario.user_id = (SELECT auth.uid())
        AND usuario.ativo = true
    )
  );
