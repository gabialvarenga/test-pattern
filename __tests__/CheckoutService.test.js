import { CheckoutService } from '../src/services/CheckoutService.js';
import { Item } from '../src/domain/Item.js';
import { Pedido } from '../src/domain/Pedido.js';
import { UserMother } from './builders/UserMother.js';
import { CarrinhoBuilder } from './builders/CarrinhoBuilder.js';

describe('CheckoutService', () => {
    const cartao = { numero: '4111111111111111', validade: '12/30' };

    // Dummy: objeto passado apenas para satisfazer o construtor; nunca deve ser usado.
    const dummyRepository = () => ({ salvar: jest.fn() });
    const dummyEmailService = () => ({ enviarEmail: jest.fn() });

    describe('quando o pagamento falha', () => {
        let gatewayStub;
        let repositoryDummy;
        let emailDummy;
        let checkoutService;
        let carrinho;

        beforeEach(() => {
            // Arrange
            carrinho = new CarrinhoBuilder().build();
            gatewayStub = { cobrar: jest.fn().mockResolvedValue({ success: false }) };
            repositoryDummy = dummyRepository();
            emailDummy = dummyEmailService();
            checkoutService = new CheckoutService(gatewayStub, repositoryDummy, emailDummy);
        });

        it('deve retornar null (verificação de estado)', async () => {
            // Act
            const pedido = await checkoutService.processarPedido(carrinho, cartao);

            // Assert
            expect(pedido).toBeNull();
        });

        it('não deve salvar o pedido nem enviar e-mail (verificação de comportamento)', async () => {
            // Act
            await checkoutService.processarPedido(carrinho, cartao);

            // Assert
            expect(repositoryDummy.salvar).not.toHaveBeenCalled();
            expect(emailDummy.enviarEmail).not.toHaveBeenCalled();
        });
    });

    describe('quando um cliente padrão finaliza a compra', () => {
        it('deve retornar o pedido salvo com o total sem desconto', async () => {
            // Arrange
            const carrinho = new CarrinhoBuilder()
                .comUser(UserMother.umUsuarioPadrao())
                .comItens([new Item('Livro', 60), new Item('Caneta', 40)])
                .build();
            const gatewayStub = { cobrar: jest.fn().mockResolvedValue({ success: true }) };
            const pedidoSalvo = new Pedido(10, carrinho, 100, 'PROCESSADO');
            const repositoryStub = { salvar: jest.fn().mockResolvedValue(pedidoSalvo) };
            const emailDummy = dummyEmailService();
            const checkoutService = new CheckoutService(gatewayStub, repositoryStub, emailDummy);

            // Act
            const pedido = await checkoutService.processarPedido(carrinho, cartao);

            // Assert (verificação de estado)
            expect(pedido).toBe(pedidoSalvo);
            expect(pedido.totalFinal).toBe(100);
            expect(pedido.status).toBe('PROCESSADO');
        });

        it('deve cobrar o valor integral, sem desconto', async () => {
            // Arrange
            const carrinho = new CarrinhoBuilder()
                .comItens([new Item('Livro', 200)])
                .build();
            const gatewayMock = { cobrar: jest.fn().mockResolvedValue({ success: true }) };
            const repositoryStub = {
                salvar: jest.fn().mockResolvedValue(new Pedido(11, carrinho, 200, 'PROCESSADO')),
            };
            const checkoutService = new CheckoutService(gatewayMock, repositoryStub, dummyEmailService());

            // Act
            await checkoutService.processarPedido(carrinho, cartao);

            // Assert
            expect(gatewayMock.cobrar).toHaveBeenCalledWith(200, cartao);
        });
    });

    describe('quando um cliente Premium finaliza a compra', () => {
        let carrinho;
        let gatewayStub;
        let repositoryStub;
        let emailMock;
        let checkoutService;
        let pedidoSalvo;

        beforeEach(() => {
            // Arrange
            const premium = UserMother.umUsuarioPremium();
            carrinho = new CarrinhoBuilder()
                .comUser(premium)
                .comItens([new Item('Teclado', 120), new Item('Mouse', 80)]) // R$ 200,00
                .build();

            pedidoSalvo = new Pedido(99, carrinho, 180, 'PROCESSADO');

            // Stubs: apenas fornecem respostas pré-definidas
            gatewayStub = { cobrar: jest.fn().mockResolvedValue({ success: true }) };
            repositoryStub = { salvar: jest.fn().mockResolvedValue(pedidoSalvo) };

            // Mock: queremos verificar COMO foi chamado
            emailMock = { enviarEmail: jest.fn().mockResolvedValue(undefined) };

            checkoutService = new CheckoutService(gatewayStub, repositoryStub, emailMock);
        });

        it('deve cobrar R$ 180,00 (10% de desconto sobre R$ 200,00)', async () => {
            // Act
            await checkoutService.processarPedido(carrinho, cartao);

            // Assert (verificação de comportamento)
            expect(gatewayStub.cobrar).toHaveBeenCalledTimes(1);
            expect(gatewayStub.cobrar).toHaveBeenCalledWith(180, cartao);
        });

        it('deve enviar exatamente 1 e-mail de aprovação com os dados corretos', async () => {
            // Act
            await checkoutService.processarPedido(carrinho, cartao);

            // Assert (verificação de comportamento)
            expect(emailMock.enviarEmail).toHaveBeenCalledTimes(1);
            expect(emailMock.enviarEmail).toHaveBeenCalledWith(
                'premium@email.com',
                'Seu Pedido foi Aprovado!',
                'Pedido 99 no valor de R$180'
            );
        });

        it('deve retornar o pedido salvo com o total final com desconto', async () => {
            // Act
            const pedido = await checkoutService.processarPedido(carrinho, cartao);

            // Assert (verificação de estado)
            expect(pedido).toBe(pedidoSalvo);
            expect(pedido.totalFinal).toBe(180);
        });

        it('deve persistir um pedido PROCESSADO com o total com desconto', async () => {
            // Act
            await checkoutService.processarPedido(carrinho, cartao);

            // Assert
            expect(repositoryStub.salvar).toHaveBeenCalledTimes(1);
            const pedidoEnviado = repositoryStub.salvar.mock.calls[0][0];
            expect(pedidoEnviado.totalFinal).toBe(180);
            expect(pedidoEnviado.status).toBe('PROCESSADO');
        });
    });

    describe('quando o envio de e-mail falha', () => {
        it('não deve falhar o checkout e deve retornar o pedido salvo', async () => {
            // Arrange
            const carrinho = new CarrinhoBuilder().build();
            const pedidoSalvo = new Pedido(5, carrinho, 100, 'PROCESSADO');
            const gatewayStub = { cobrar: jest.fn().mockResolvedValue({ success: true }) };
            const repositoryStub = { salvar: jest.fn().mockResolvedValue(pedidoSalvo) };
            const emailStub = { enviarEmail: jest.fn().mockRejectedValue(new Error('SMTP fora do ar')) };
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            const checkoutService = new CheckoutService(gatewayStub, repositoryStub, emailStub);

            // Act
            const pedido = await checkoutService.processarPedido(carrinho, cartao);

            // Assert
            expect(pedido).toBe(pedidoSalvo);
            consoleSpy.mockRestore();
        });
    });
});
