## **FORMATO DE ENTRADA** 

## TRANSFER_FULL 

### CONTENIDO 

**1. INTRODUCCIÓN ............................................................................................................................. 3 2. ESPECIFICACIONES DEL ARCHIVO .......................................................................................... 3** 

**3. ANEXO 2 (CODIGOS DE MOTIVO DE TRANSFERENCIAS SEGÚN ORGANISMO DE CONTROL ECUATORIANO) .................................................................................................................. 9** 

**1. INTRODUCCIÓN** 

Este Documento define en detalle las especificaciones del archivo plano de carga en el proceso de pagos al exterior en Cash Management de Produbanco. 

Para el proceso de pagos, el cliente debe generar un archivo con información en base al detalle que se muestra a continuación. 

Es responsabilidad del cliente el validar que la información generada para procesar los pagos sea consistente y correcta. 

Los campos deben ser separados por un <TABULADOR>, en el caso de que el cliente no necesite algún campo (como el caso de campos opcionales), igualmente debe poner un blanco y el correspondiente <TABULADOR>. 

La información de beneficiarios debe estar registrada previamente y en ESTADO ACTIVO. 

Transferencias exentas de ISD deben cargarse una por archivo. 

**2. ESPECIFICACIONES DEL ARCHIVO** 

El archivo Transfer Full de Cash Management tendrá la siguiente estructura. 

### **DETALLE DE TRANSFERENCIAS AL EXTERIOR (ITEMS)** 

|**Campo**|<br>**Nombre de**<br>**Campo**|**Tipo y**<br>**Longitud**|**Observaciones**|
|---|---|---|---|
|1<br>A|Código Orientación|Char (2)|**Campo Obligatorio**<br>Indica el Código del Servicio.<br>PA = Pago.|
|2<br>B|Cuenta Empresa|Num (11)|**Campo Obligatorio**<br>Número de la cuenta de la Empresa que será utilizado<br>para el servicio. Si la cuenta no tiene la longitud de 11<br>dígitos SE DEBE completar con ceros a la izquierda<br>Ejemplo: si la cuenta es de 7 dígitos 1234567<br>Debe venir 00001234567|
|3<br>C|Secuencial Pago|Num(7)|**Campo Obligatorio**<br>Número secuencial dentro de la orden, debe comenzar<br>desde uno. Relaciona con el desglose de los rubros del<br>pago.<br>Estos desgloses sólo aplican para pagos en ventanilla.<br>NO es necesario completar con ceros a la izquierda|
|4<br>D|Comprobante de Pago|Char (20)|**Campo Opcional**<br>Comprobante de pago, egreso, planilla, etc.<br>NO es necesario completar con ceros a la izquierda|



|5|Contrapartida|Char (34)|**Campo Obligatorio**|
|---|---|---|---|
|E|||Número de cuenta del beneficiario, debe ser tal cual está<br>registrada en la base de beneficiarios.|
|6<br>F|Moneda|Char (3)|**Campo Obligatorio**<br>Código de Moneda del Movimiento.<br>USD = Dólares.|
|7<br>G|Valor|Num (13)|**Campo Obligatorio**<br>Valor del PAGO. 11 enteros y 2 decimales.<br>Ejemplo: si el valor del pago es 12.645,76 debe venir<br>0000001264576|
|8<br>H|Forma de Pago|Char (3)|**Campo Obligatorio**<br>Forma de Pago.<br>CTA = Crédito a Cuenta|
|9<br>I|Código de Institución<br>Financiera|Char(4)<br>O<br>Char(15)|**Campo Obligatorio**<br>Código SWIFT o ABA del banco del beneficiario de<br>acuerdo a la base de beneficiarios previamente ingresada<br>y en estado ACTIVO.|
|10<br>J|Tipo de Cuenta|Char (3)|**Campo Obligatorio**<br>Indica el Tipo de Cuenta a donde se acreditará el<br>movimiento.<br>CTE = Cuenta Corriente<br>AHO = Cuenta de Ahorros.|
|11<br>K|Número de Cuenta|Char(34)|**Campo Obligatorio**<br>Indica el Número de Cuenta a donde se acreditará el<br>movimiento, debe ser tal cual está registrada en la base<br>de beneficiarios.|
|12<br>L|Tipo ID Cliente<br>Beneficiario|Char (1)|**Campo Obligatorio**<br>Tipo de Identificación del beneficiario.<br>C = Cédula<br>R = RUC<br>P = Pasaporte|



|13|Número ID Cliente|Char (13)|**Campo Obligatorio**|
|---|---|---|---|
|M|Beneficiario|O|Número de identificación del beneficiario.|
|||Char (10)|Si es cédula debe tener 10 dígitos. Ejemplo: 0912378320|
||||Si<br>es<br>RUC<br>debe<br>tener<br>13<br>dígitos.<br>Ejemplo:<br>0912378320001<br>Si es pasaporte puede tener hasta 13 caracteres. Ejemplo:<br>PX39582|
|14|Nombre del Cliente|Char (70)|**Campo Obligatorio**|
|N|Beneficiario||Nombre del Beneficiario.|
|15|Dirección|Char(40)|**Campo Opcional**|
|O|Beneficiario||No se debe ingresar, se mostraría así <TAB><TAB>|
|16|Ciudad|Char(20)|**Campo Opcional**|
|P|Beneficiario||No se debe ingresar, se mostraría así <TAB><TAB>|
|17|Teléfono|Char(20)|**Campo Opcional**|
|Q|Beneficiario||No se debe ingresar, se mostraría así <TAB><TAB>|
|18|Localidad de pago|Char (20)|**Campo Opcional**|
|R|||No se debe ingresar, se mostraría así <TAB><TAB>|
|19|Referencia|Char(200)|**Campo Opcional**|
|S|||No se debe ingresar, se mostraría así <TAB><TAB>|



|0<br>T|Referencia<br>para<br>el<br>beneficiario<br>(RFB),<br>Relación<br>con<br>el<br>ordenante, Gastos por<br>cuenta de|Char(43)|**Campo Obligatorio**<br>Referencia para el beneficiario: comprende el detalle de<br>la transacción<br>Relación con el ordenante OBLIGATORIO: comprende la<br>relación con el beneficiario, esta puede ser: COMERCIAL,<br>FAMILIAR, LABORAL<br>Gastos pro cuenta de OBLIGATORIO: detalla la condición<br>de gastos si son asumidos por el ordenante (OUR) o el<br>beneficiario(BEN)<br>Los tres campos deben separarse por el signo !<br>**Ejemplo**:<br>ROL DE PAGOS!FAMILIAR!OUR!<br>ó<br>ROL DE PAGOS!COMERCIAL!OUR!<br>En caso de no constar la instrucción, el sistema registra<br>los gastos por cuenta del Beneficiario (BEN)<br>IMPORTANTE:  NO COLOCAR ESPACIOS EN BLANCO<br>CON CARACTERES ESPECIALES. NO COLOCAR DOBLE<br>ESPACIO EN BLANCO.<br>El campo en su totalidad no puede superar los 43<br>caracteres incluidos los signos de admiración.|
|---|---|---|---|
|21<br>U|||**Campo Opcional**<br>No se debe ingresar, se mostraría así <TAB><TAB>|
|22<br>V|||**Campo Opcional**<br>No se debe ingresar, se mostraría así <TAB><TAB>|
|23<br>W|(INV)<br>Facturas<br>(Transferencias<br>al<br>exterior)|Char(26)|**Campo Opcional**<br>Podrían colocar el documento que hace referencia al pago<br>y que le puede servir como información al beneficiario en<br>el<br>mensaje SWIFT<br>enviado,<br>u<br>otra<br>información<br>relacionada al mismo.<br>IMPORTANTE:  NO COLOCAR ESPACIOS EN BLANCO<br>CON CARACTERES ESPECIALES.  NO COLOCAR<br>DOBLE ESPACIO EN BLANCO.<br><TAB><TAB>|



|24|Motivo<br>de<br>la|Num (10)|**Campo Obligatorio**|
|---|---|---|---|
|X|transferencia||(en PRODUBANCO es obligatorio, en Produbank no es<br>obligatorio, debe ir en blanco, se mostraría así<br><TAB><TAB>)<br>Catálogo SIB de motivos de la transferencia<br>Y después de la coma código de Exención, si es sin<br>Exención 0<br>Ejemplo: 106,0|
|25<br>Y|||**Campo Opcional**<br>No se debe ingresar, se mostraría así <TAB><TAB>|
|26<br>Z|||**Campo Opcional**<br>No se debe ingresar, se mostraría así <TAB><TAB>|
|27<br>AA|||**Campo Opcional**<br>No se debe ingresar, se mostraría así <TAB><TAB>|
|28|||**Campo Opcional**|
|AB|||No se debe ingresar, se mostraría así <TAB><TAB>|
|29|||**Campo Opcional**|
|AC|||No se debe ingresar, se mostraría así <TAB><TAB>|
|30<br>AD|Número DAU, en caso<br>de que el motivo de la<br>transferencia lo solicite<br>(parametrizado)|Char(19)|**Campo Opcional**<br>Número DAI, DAE o DAS escrito en formato<br>DDDAAAARR00000000,<br>Se acepta solo números y el guión.<br>En caso de no ser necesario no se ingresa este campo.|
|31<br>AE|Número de Registro en<br>caso de que el motivo<br>de la transferencia lo<br>solicite<br>(parametrizado)|Char(10)|**Campo Opcional**<br>Este campo se vuelve obligatorio, en caso de que el<br>motivo de la transferencia sea parametrizado para<br>aceptar este campo, se puede ingresar números y letras.|



|32|Fecha de Registro en|Char(10)|**Campo Opcional**|
|---|---|---|---|
|AF|caso de que el motivo<br>de la transferencia lo<br>solicite<br>(parametrizado)||Este campo se vuelve obligatorio, en caso de que el<br>motivo de la transferencia sea parametrizado para<br>aceptar este campo, el formato de fecha es: dd/mm/yyyy|
|33<br>AG|Numero de Formulario<br>ISD|Char(15)|**Campo Opcional**<br>Este campo se vuelve obligatorio, en caso de que la<br>transferencia sea parametrizado con exención|
|34<br>AH|Código<br>de<br>banco<br>intermediario|Char(11)|**Campo Opcional**<br>Transferencia<br>utilizando<br>beneficiarios<br>con<br>banco<br>intermediario|
|35<br>AI|Número<br>de<br>Cuenta<br>banco Beneficiario|Char(20)|**Campo Opcional**<br>Solo si la transferencia es a través de banco intermediario<br>y se requiere cuenta en banco beneficiario en vez de<br>código de banco beneficiario|
|36<br>AJ|Número de Contrato de<br>Reaseguro|Char(20)|**Campo Opcional**<br>Este campo se vuelve obligatorio, en caso de que el<br>motivo de la transferencia sea parametrizado (Primas por<br>reaseguros / retrocesiones)|
|37|Código de cotización|Char(15)|**Campo Opcional**|
|AK|||Este campo registra la cotización negociada previamente|



**Ejemplo 1:** El Cliente ABC va a utilizar este servicio para realizar una transferencia. 

Entonces, el archivo enviado por el cliente ABC tendría el siguiente formato: 

PA<TAB>02XXXXXXX57<TAB>1<TAB>1<TAB>IT26XXXXXX879<TAB>EUR<TAB>000 900000000<TAB>CTA<TAB>COBADEFF<TAB>CTE<TAB>IT26XXXXXX879<TAB>P<T AB>7987987987<TAB>BENEFICIARIO1<TAB>1<TAB>1<TAB>1<TAB>1<TAB>1<TAB >PAGO!COMERCIAL!OUR!<TAB>1<TAB>1<TAB>1<TAB>110,0<TAB>1<TAB>1<TAB> 1<TAB>1<TAB>1<TAB>1<TAB>1<TAB>1<TAB>1<TAB>1<TAB>1<TAB>1<TAB> 

**3. ANEXO 2 (CODIGOS DE MOTIVO DE TRANSFERENCIAS según Organismo de control ecuatoriano)** 

|**CODIG**<br>**1. Com**|**O**<br>**DESCRIPCION**<br>**ercio exterior de bienes**|
|---|---|
|105|Importaciones / Exportaciones|
|110|Anticipos por Importaciones / Exportaciones|
|**2. Com**|**ercio exterior de servicios**|
|<br>**_Servici_**|**_os de transporte_**<br>|
|201|Servicios de transporte marítimo, aéreo y terrestre de pasajeros (rutas<br>internacionales)|
|202|Servicios de transporte marítimo, aéreo y terrestre de carga (fletes)|
|203|Servicios portuarios y de aeropuerto|
|**Viajes**<br>|**/ turismo**<br>|
|205|Viajes, salvo servicios de transporte de pasajeros|
|**Servici**<br>|**os financieros**<br>|
|210|Primas por reaseguros / retrocesiones|
|212|Indemnizaciones de seguros|
|214|Servicios financieros|
|216|Restitución de avales y garantías en moneda extranjera|
|218<br>**Servici**|Arrendamiento mercantil<br>**os técnicos**|



|220|Servicios de telecomunicaciones|
|---|---|
|222|Servicios de informática y de información|
|224|Marcas, patentes, regalías y derechos de licencia|
|226|Servicios arquitectónicos, de ingeniería y otros servicios técnicos|
|228|Servicios agrícolas, mineros y de transformación en el lugar|
|230|Servicios médicos, quirúrgicos y hospitalarios (Gastos de Salud)|
|232|Servicios audiovisuales y afines|
|**Servici**|**os empresariales**|
|240|Arrendamiento|
|242|Construcción|
|244|Investigación y desarrollo|
|246|Servicios jurídicos, contables y de asesoramiento de empresas|
|248|Servicios de publicidad e investigación de mercado|
|250<br>**Otros**|Reparaciones<br>**servicios**|
|260|Servicios culturales, artísticos y deportivos|
|262|Servicios a gobiernos extranjeros|
|264|Suscripciones, cuotas de afiliación y aportes periódicos|
|266|Gastos educativos|
|268|Anticipos en operaciones de comercio exterior de servicios|
|**3. Rem**|**uneración de empleados **|
|300|Pagos laborales|



|**4. Rent**|**a de la inversión**|
|---|---|
|405|Dividendos / distribución de utilidades|
|410|Intereses de créditos|
|415|Rendimiento de inversiones financieras|
|**5. Tran**|**sferencias**|
|505|Remesas de trabajadores|
|510|Donaciones|
|515|En cumplimiento de leyes o disposiciones de organismos de control|
|**6. Tran**|**sacciones de activos frente a no residentes **|
|610|Amortización de créditos e intereses|
|615|Desembolso de créditos|
|620|Prepago de créditos|
|625|Inversiones financieras a largo plazo en el exterior|
|630|Inversiones financieras a corto plazo en el exterior|
|635|Inversiones de capital a largo plazo en el exterior|
|640|Inversiones de capital a corto plazo en el exterior|
|645|Inversiones overnight en el exterior|
|650|Depósitos en cuenta en el exterior|
|**7. Tran**|**sacciones de pasivos frente a no residentes **|
|710|Amortización de créditos concedidos por no residentes|
|720|Prepago de créditos|



Versión: 08/28/2025 

# Produbanco Vn 

En Pro de ti 

