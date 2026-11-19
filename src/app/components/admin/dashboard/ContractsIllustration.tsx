/** Pilha de 3 contratos (folhas) do card "Contratos ativos". Decorativo. */
export default function ContractsIllustration() {
  const sheet = "absolute bottom-0 w-14 rounded-md border-[0.5px] border-illustration-stroke";

  return (
    <div aria-hidden className="relative h-16 w-[88px] shrink-0">
      <div className={`${sheet} left-0 h-[55px] bg-illustration-1`} />
      <div className={`${sheet} left-4 h-[60px] bg-illustration-2`} />
      <div className={`${sheet} left-8 flex h-16 flex-col gap-2 bg-illustration-3 px-[7px] pt-3`}>
        <span className="h-[3px] w-4 rounded-xl bg-illustration-stroke" />
        <span className="h-[3px] w-[41px] rounded-xl bg-illustration-stroke" />
        <span className="h-[3px] w-[41px] rounded-xl bg-illustration-stroke" />
        <span className="h-[3px] w-[41px] rounded-xl bg-illustration-stroke" />
      </div>
    </div>
  );
}
