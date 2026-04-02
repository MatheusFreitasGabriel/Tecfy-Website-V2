import Form from "../../components/public/contato/ContactForm/Form";

export default function Contato() {
    return (
        <section className="w-full h-screen flex justify-center items-center">
            <div className="flex flex-col h-full w-full max-w-[1440px] py-32 px-6 justify-between gap-6 md:flex-row md:gap-28 ">
                <div className="flex flex-col gap-6 md:justify-between md:h-full">
                    <div className="flex flex-col gap-3 ">
                        <span className="text-secondary text-base ">CONTATE-NOS</span>
                        <h1 className="text-6xl text-text-primary font-semibold md:text-8xl">CONTATO</h1>
                        <p className="text-base font-medium text-text-secondary">ULTILIZE A TECNOLOGIA COMO VANTAGEM COMPETITIVA;<br/>PREENCHA SEUS DADOS PARA COMEÇARMOS.</p>
                    </div>
                    <div className="flex flex-row justify-between">
                        <div className="flex flex-col gap-2">
                            <span className="text-lg font-medium text-text-secondary">EMAIL</span>
                            <p className="text-lg font-semibold text-text-primary">CONTATO@TECFY.DEV</p>
                        </div>
                        <div className="flex flex-col gap-2">
                            <span className="text-lg font-medium text-text-secondary">TEL</span>
                            <p className="text-lg font-semibold text-text-primary">+55 (11) 94077-4506</p>
                        </div>
                    </div>
                </div>
                <Form/>
            </div>
        </section>
    );
}