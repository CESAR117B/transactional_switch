





<!-- Start of picture text -->
a<br><!-- End of picture text -->

**FORMATO DE ENTRADA** PAGOS_FULL 







<!-- Start of picture text -->
Produbanco We<br>En Pro de ti<br><!-- End of picture text -->





## **Registros de cambios en el documento** 

|**Versión**|**Motivo**|**Realizado por**|**Fecha**|
|---|---|---|---|
|1.1|Versión Inicial|Mónica Pasquel|07/04/2022|









<!-- Start of picture text -->
Produbanco ¥<<br>En Pro de ti<br><!-- End of picture text -->

### **CONTENIDO** 

|**1.**|**INTRODUCCIÓN .................................................................................................................. 4**|
|---|---|
|**2.**|**ESPECIFICACIONES DEL ARCHIVO ................................................................................ 4**|
|**3.**|**ANEXO: CÓDIGOS DE INSTITUCIONES FINANCIERAS LOCALES ............................ 10**|













<!-- Start of picture text -->
Produbanco Ye<br>En Pro de ti<br><!-- End of picture text -->

##### **1. INTRODUCCIÓN** 

Este Documento define en detalle las especificaciones del archivo plano de carga en el proceso de pagos locales en Cash Management de Produbanco. 

Para el proceso de pagos, el cliente debe generar un archivo con información en base al detalle que se muestra a continuación. 

Es responsabilidad del cliente el validar que la información generada para procesar los pagos  sea consistente y correcta. 

En este proceso se puede trabajar con diferentes formas de pago, entre ellas:  crédito en cuentas Produbanco, transferencias a cuentas en otros bancos locales, emisión de cheques, o pagos en efectivo. 

Los campos deben ser separados por un  <TABULADOR>, en el caso de que el cliente no necesite algún campo (como el caso de campos opcionales), igualmente debe poner un blanco y el correspondiente <TABULADOR>. 

En caso de existir un pago que contenga más de una factura y se desee realizar un solo pago con cheque o crédito en cuenta se puede utilizar la sección del desglose, caso contrario no. Dicho desglose se imprimirá en el comprobante de pago como detalle del pago realizado. 

##### **2. ESPECIFICACIONES DEL ARCHIVO** 

El archivo Pagos Full de Cash Management tendrá la siguiente estructura. 

#### **DETALLE DE PAGOS (ITEMS)** 

|**Campo**|**Nombre de Campo**|**Tipo y**<br>**Longitud**|**Observaciones**|
|---|---|---|---|
|1<br>A|Código Orientación|Char (2)|**Campo Obligatorio**<br>Indica el Código del Servicio.<br>PA = Pago.|
|2<br>B|Cuenta Empresa|Num (11)|**Campo Obligatorio**<br>Número de la cuenta de la Empresa que será utilizado para el servicio.<br>Si la cuenta no tiene la longitud de 11 dígitos SE DEBE completar con<br>ceros a la izquierda<br>Ejemplo: si la cuenta es de 7 dígitos 1234567<br>Debe venir 00001234567|
|3<br>C|Secuencial Pago|Num(7)|**Campo Obligatorio**<br>Número secuencial dentro de la orden, debe comenzar desde uno.<br>Relaciona con el desglose de los rubros del pago.<br>Estos desgloses sólo aplican para pagos en ventanilla.<br>NO es necesario completar con ceros a la izquierda|
|4<br>D|Comprobante de Pago|Char (20)|**Campo Opcional**<br>Comprobante de pago, egreso,  planilla, etc.<br>NO es necesario completar con ceros a la izquierda|







|5|Contrapartida|Char (20)|**Campo Obligatorio**|
|---|---|---|---|
|E|||Para el caso de pagos con crédito en cuenta completar con el número<br>de la cuenta del beneficiario.<br>Para el caso de pagos en ventanilla completar con el número de<br>identificación del beneficiario.<br>Si se requiriere, este campo puede contener información como: Código<br>de Beneficiario, Código de Proveedor, etc.<br>NO es necesario completar con ceros a la izquierda.|
|6<br>F|Moneda|Char (3)|**Campo Obligatorio**<br>Código de Moneda del Movimiento.<br>USD = Dólares.|
|7<br>G|Valor|Num (13)|**Campo Obligatorio**<br>Valor del PAGO. 11 enteros y 2 decimales.<br>Ejemplo: si el valor del pago es 12.645,76 debe venir 0000001264576|
|8<br>H|Forma de Pago|Char (3)|**Campo Obligatorio**<br>Forma de Pago.<br>CTA = Crédito a Cuenta<br>CHQ = Cheque.<br>EFE = Efectivo|
|9<br>I|Código<br>de<br>Institución<br>Financiera|Char(4)<br>O<br>Char(15)|**Campo Obligatorio**<br>**Si la forma de pago es EFE o CHQ**<br>Este campo deberá ser llenado con el código de institución financiera<br>correspondiente a PRODUBANCO:  0036<br>**Si la forma de pago es CTA:**<br>Si los pagos son locales el código de la institución financiera es de 4<br>dígitos<br>Ejemplo:  0036 (corresponde a PRODUBANCO)<br>**Si los pagos son por SPL via BCE :**<br>Se debe poner el código de institución financiera 0001 que corresponde<br>al Banco Central del Ecuador.<br>Verificar la lista de instituciones financieras locales en el**Anexo**.|







|10|Tipo de Cuenta|Char (3)|**Campo Obligatorio**|
|---|---|---|---|
|J|||**Si forma de Pago es: CTA = Crédito a Cuenta.**<br>Indica el Tipo de Cuenta a donde se acreditará el movimiento.<br>CTE = Cuenta Corriente<br>AHO = Cuenta de Ahorros.<br>TAR = Tarjeta de Crédito (Otros Bancos)<br>**Si la forma de pago es CHQ o EFE**<br>Este campo no debe ser llenado.<br>**Si el Tipo de Cuenta es TAR:**<br>El código de banco debe ser el emisor de la tarjeta.|
|11<br>K|Número de Cuenta|Num (11)<br>O<br>Char(30)|**Campo Obligatorio**<br>**Si forma de Pago es:   CTA = Crédito a Cuenta.**<br>Indica el Número de Cuenta a donde se acreditará el movimiento.<br>Si la cuenta es de PRODUBANCO la longitud es de 11 dígitos.  Si esta<br>longitud es menor se debe completar con ceros a la izquierda.<br>Si la cuenta es de otra institución financiera que no sea<br>PRODUBANCO no rellenar con ceros a la izquierda<br>Ejemplo:<br>Cuenta PRODUBANCO es de 7 dígitos 1234567<br>Debe venir 00001234567<br>**Si la forma de pago es CHQ o EFE**<br>Este campo no debe ser llenado.|
|12<br>L|Tipo ID Cliente<br>Beneficiario|Char (1)|**Campo Obligatorio**<br>Tipo de Identificación del beneficiario.<br>C = Cédula<br>R = RUC<br>P = Pasaporte|
|13|Número ID Cliente|Char (13)|**Campo Obligatorio**|
|M|Beneficiario|O<br>Char (10)|Número de identificación del beneficiario.<br>Si es cédula debe tener 10 dígitos. Ejemplo: 0912378320<br>Si es RUC debe tener 13 dígitos. Ejemplo: 0912378320001<br>Si es pasaporte puede tener hasta 13 caracteres. Ejemplo: PX39582|
|14|Nombre del Cliente|Char (40)|**Campo Obligatorio**|
|N|Beneficiario||Nombre del Beneficiario.|
|15|Dirección|Char(40)|**Campo Opcional**|
|O|Beneficiario||Dirección del Beneficiario|
|16|Ciudad|Char(20)|**Campo Opcional**|
|P|Beneficiario||Ciudad del Beneficiario|
|17|Teléfono|Char(20)|**Campo Opcional**|
|Q|Beneficiario||Teléfono del Beneficiario|





|18|Localidad de pago|Char (20)|**Campo Opcional**|
|---|---|---|---|
|R|||**Si la forma de pago es CTA**<br>debe ir en blanco<br>**Si la forma de pago es EFE o CHQ**puede ir lo siguiente en caso de<br>querer restringir la localidad en donde el cliente se acerque a retirar su<br>pago:<br>En blanco = En cualquier localidad o,<br>QUITO, GUAYAQUIL, CUENCA, AMBATO, RIOBAMBA, LOJA,<br>ESMERALDAS, IBARRA, SANTO DOMINGO, etc.|
|19|Referencia|Char(200)|**Campo Obligatorio**|
|S|||Referencia del Pago: Número de Factura<br>Si se envía notificación vía email a los proveedores, este campo será el<br>que se imprima como número de factura.|
|20|Referencia Adicional|Char(100)|**Campo Opcional**|
|T|||Referencia adicional del Pago | dirección de correo<br>Cuando se desee enviar un mail debe venir primero el pipe (|) y luego<br>la dirección de correo electrónico.|



#### **Ejemplo 1:** 

El Cliente ABC va a utilizar este servicio para pago a sus proveedores con crédito a cuenta. 

El número de la cuenta de la empresa que se va a utilizar es el 13040143820. El crédito se va a realizar con el número de comprobante 78999 a la cuenta de PRODUBANCO con número 00001825321 por $645.76, el RUC del proveedor es 0912378320001, se llama Juan Pérez Izquierdo, la dirección es 10 de Agosto 5844 y Pereira en Quito, su teléfono es 2460125. 

El pago corresponde a las facturas 666633, 7377356,994994 por PAGOS VARIOS y se desea enviar notificación automática del pago realizado a la dirección de correo morao@produbanco.com 

Entonces, el archivo enviado por el cliente ABC tendría el siguiente formato: 

PA<TAB>13040143820<TAB>1<TAB>78999<TAB>00001825321<TAB>USD<TAB>0000000064576<TAB >CTA<TAB>0036<TAB>CTE<TAB>00001825321<TAB>R<TAB>0912378320001<TAB>JUAN PEREZ IZQUIERDO<TAB>10 DE AGOSTO 5844 Y PEREIRA<TAB>QUITO <TAB>2460125 <TAB><TAB>666633, 7377356,994994 <TAB> PAGOS VARIOS| morao@produbanco.com 

#### **Ejemplo 2:** 

El Cliente ABC va a utilizar este servicio para pago a sus proveedores con cheque de emergencia a realizarse en ventanilla. 

El número de la cuenta de la empresa que se va a utilizar es el 13040143820. El pago se va a realizar con el número de comprobante 78999 por $645.76, el RUC del proveedor es 0912378320001, se llama Juan Pérez Izquierdo, la dirección es 10 de Agosto 5844 y Pereira en Quito, su teléfono es 2460125. Se desea además que el proveedor cobre el cheque en cualquier localidad del banco. 

El pago corresponde a las facturas 666633, 7377356,994994 por PAGOS VARIOS y se desea enviar notificación automática del pago realizado a la dirección de correo morao@produbanco.com 

Entonces, el archivo enviado por el cliente ABC tendría el siguiente formato: 

PA<TAB>13040143820<TAB>1<TAB>78999<TAB>0912378320001<TAB>USD<TAB>0000000064576<T AB>CHQ<TAB>0036<TAB><TAB><TAB>R<TAB>0912378320001<TAB>JUAN PEREZ IZQUIERDO<TAB>10 DE AGOSTO 5844 Y PEREIRA<TAB>QUITO <TAB>2460125 <TAB><TAB>666633, 7377356,994994 <TAB> PAGOS VARIOS| morao@produbanco.com 



#### **Ejemplo 3** : 

El Cliente ABC va a utilizar este servicio para pago a sus proveedores en efectivo a realizarse en ventanilla. 

El número de la cuenta de la empresa que se va a utilizar es el 13040143820. El pago se va a realizar con el número de comprobante 78999 por $645.76, el RUC del proveedor es 0912378320001, se llama Juan Pérez Izquierdo, la dirección es 10 de Agosto 5844 y Pereira en Quito, su teléfono es 2460125. Se desea además que el proveedor cobre el dinero sólo en la localidad CUENCA. 

El pago corresponde a las facturas 666633, 7377356,994994 por PAGOS VARIOS y se desea enviar notificación automática del pago realizado a la dirección de correo morao@produbanco.com 

Entonces, el archivo enviado por el cliente ABC tendría el siguiente formato: 

PA<TAB>13040143820<TAB>1<TAB>78999<TAB>0912378320001<TAB>USD<TAB>0000000064576<T AB>EFE<TAB>0036<TAB><TAB><TAB>R<TAB>0912378320001<TAB>JUAN PEREZ IZQUIERDO<TAB>10 DE AGOSTO 5844 Y PEREIRA<TAB>QUITO <TAB>2460125 <TAB>CUENCA<TAB>666633, 7377356,994994 <TAB> PAGOS VARIOS| morao@produbanco.com 









<!-- Start of picture text -->
Produbanco Ye<br>En Pro de ti<br><!-- End of picture text -->

#### **DESGLOSE DE PAGOS (RUBROS – SUBITEMS)** 

El desglose de pagos es una sección del archivo Opcional, en el caso que requieran cargar algún detalle extra al pago a realizar. 

|**Campo**|**Nombre de Campo**|**Tipo y Longitud**|<br>**Observaciones**|
|---|---|---|---|
|1<br>A|Tipo de Registro|Char (2)|**Campo Obligatorio**<br>Indica el tipo de registro.<br>DE = Desglose del pago (Rubros)|
|2<br>B|Secuencial Pago|Num(7)|**Campo Obligatorio**<br>Relación con el detalle de los rubros del pago<br>Es decir se relaciona con el registro PA a través del<br>campo número 3 que tiene el mismo nombre Secuencial<br>Pago|
|3<br>C|Tipo de Rubro|Char (7)|**Campo Obligatorio**<br>Indica La orientación del rubro.<br>INGRESO, EGRESO<br>Si es un desglose positivo (a favor del proveedor) es<br>INGRESO y si es un desglose negativo (en contra del<br>proveedor) es EGRESO.|
|4<br>D|Concepto|Char(50)|**Campo Obligatorio**<br>Indica el concepto o referencia del rubro.|
|5<br>E|Valor Base|Num (13)|**Campo Obligatorio**<br>Valor Base referencial. 11 enteros y 2 decimales.<br>Ejemplo: si el valor base es 12.645,76     debe venir<br>0000001264576|
|6<br>F|Porcentaje|Num (5)|**Campo Obligatorio**<br>Porcentaje referencial de cargo o descuento al Valor<br>Base. 3 enteros y 2 decimales.<br>Ejemplo: si el porcentaje es 25,00%        debe venir 02500<br>Para los pagos a proveedores debe venir sólo 00000|
|7<br>G|Valor Neto|Num (13)|**Campo Obligatorio**<br>Valor del Rubro. 11 enteros y 2 decimales.<br>Ejemplo: si el valor del rubro es 12.645,76 debe venir<br>0000001264576<br>Para los pagos a proveedores debe venir lo mismo que el<br>valor base.|



#### **Ejemplo** 

El Cliente ABC va a utilizar este servicio para pago a sus proveedores con crédito a cuenta. El archivo enviado por el cliente ABC tendría el siguiente formato en la sección Desglose del Pago: 

DE<TAB>345<TAB>INGRESO<TAB>PAGO DE SERVICIOS DE ALIMENTACION<TAB> 0000000041959<TAB>02500<TAB>0000000023454 

**3. ANEXO: Códigos de Instituciones Financieras Locales** 

Este catálogo podría cambiar si se habilitan o eliminan Instituciones Financieras o 

cooperativas, por favor solicitar a su ejecutivo de CASH el listado actualizado. 

|Código Ba<br>0036<br>~~Po~~<br>|nco<br>Nombre Banco<br>PRODUBANCO<br>~~NN~~<br> <br>|
|---|---|
|0034<br> <br><br><br>|AMAZONAS<br> <br> <br>~~NN~~<br><br><br><br>|
|0037<br> <br><br><br>|BOLIVARIANO<br> <br> <br><br>~~NN~~<br>~~SN~~<br><br><br><br>|
|0024<br><br>~~p~~<br><br>|CITIBANK<br><br><br><br>~~ON~~<br><sup>~~RNS~~</sup><br>~~NA~~<br>~~N ~~<br>|
|0017<br><br><br><br>|GUAYAQUIL<br><br><br><br> <br><br><br>|
|0029<br><br>~~po ~~<br>~~a~~|LOJA<br><br>~~NI~~<br> ~~NTN~~<br>~~TNT~~<br>|
|0043<br><br> <br><br><br>|DEL LITORAL<br> <br> <br><br> ~~Oc~~<br><br><br>|
|0030<br><br><br>|PACIFICO<br>~~ee~~<br><br><br><br>|
|0010<br><br><br>|PICHINCHA<br><br><br><br><br><br>|
|0042<br><br><br>|RUMINAHUI<br> <br><br><br>~~NNT~~<br><br>|
|0032<br> <br><br>|INTERNACIONAL<br> <br> <br><br>|
|0039<br>~~a~~<br>|COMERCIAL DE MANABI<br>|
|0025<br>~~a ~~<br>|MACHALA<br> ~~Qe~~<br>|
|0035<br>~~a~~|AUSTRO<br>|
|0001<br>~~a~~|BANCO CENTRAL<br>|
|0059<br><br>~~a~~<br>|SOLIDARIO<br><br><br>|
|0086<br>~~a~~|MUTUALISTA PICHINCHA<br>|
|0140<br><br>~~a~~<br>|ECUATORIANO DE LA VIVIENDA<br><br><br>|
|0088<br>~~a~~|MUTUALISTA AZUAY<br>|
|0087<br>~~a~~|MUTUALISTA AMBATO<br>|
|0085<br>~~a~~<br>|MUTUALISTA IMBABURA<br><br>|
|9967<br>~~a~~|DINERS CLUB<br>|
|9969<br><br>~~a~~<br>|COOP. TULCAN<br><br><br>|
|9970<br>~~a~~|COOP. PABLO MUNOZ VEGA<br>|
|9971<br>~~a~~|COOP. CALCETA LTDA.<br>|
|9972<br>~~a~~<br>|COOP DE AH Y CR CONSTRUCCION COMERCIO Y PRODUCCION<br><br>|
|9974<br>~~a~~<br>|COOP. JUVENTUD ECUATORIANA PROGRESISTA LTDA.<br><br>|
|9976<br>~~a~~<br>|COOP. AHO Y CREDITO SANTA ANA<br><br>|
|9977<br>~~a~~<br>|COOP. ALIANZA DEL VALLE LTDA.<br><br>|
|9979<br>~~a~~<br>|COOP. RIOBAMBA<br><br>|
|9980<br>~~a~~<br>|COOP. COMERCIO LTDA PORTOVIEJO<br><br>|
|9981<br>~~a~~|COOP. CHONE LTDA.<br>|
|9982<br>~~a~~<br>|COOP. CACPECO<br><br>|
|9983<br>~~a~~<br>|COOP. ATUNTAQUI<br><br>|
|9984<br>~~a~~<br>|COOP. GUARANDA<br><br>|
|9986<br>~~a~~|COOP. AHO Y CREDITO EL SAGRARIO<br>|
|9987<br>~~a~~<br>|COOP. OSCUS<br><br>|
|9988<br>~~a~~<br>|COOP. LA DOLOROSA<br><br>|
|9994<br>~~a~~|COOP. COTOCOLLAO<br>|
|9995<br>~~a~~|COOP. 29 DE OCTUBRE<br>|
|9997<br>~~a~~|COOP. PEQ. EMPRESA DE PASTAZA<br>|
|9998<br><br>~~a~~<br>|COOP. ANDALUCIA<br><br><br>|
|9999<br>~~a~~<br>|COOP. PREVISION AHORRO Y DESARROLLO<br><br>|
|0060<br>~~a~~|BANCO PROCREDIT<br>|
|0062<br>~~a~~|BANCO PARA LA ASISTENCIA COMUNITARIA FINCA S.A.<br>|
|9965<br>~~a~~|COOP AHORRO Y CREDITO COOPROGRESO<br>|
|<br>9964<br><br>~~a~~|.<br>FINANCIERA FINANCOOP<br><br>|
|9993<br>~~a~~|COOP. AHO Y CREDITO JARDIN AZUAYO<br>|
|9992<br>~~a~~<br>|COOP. AHO Y CREDITO SAN FRANCISCO<br><br>|
|9991<br>~~a~~<br>|COOP AHO Y CREDITO SAN JOSE<br><br>|
|9989<br>~~a~~<br>|COOP AHO Y CREDITO  MANUEL GODOY<br><br>|
|9985<br>~~a~~<br>|COOP AHO Y CREDITO SANTA ROSA<br><br>|
|9975<br>~~a~~|COOP. AHO Y CREDITO 23 DE JULIO<br>|
|9963<br><br>~~a~~|CORPORACION FINANCIERA<br><br><br>|



|0061<br>0109|BANCO CAPITAL<br>COOP. DE AHORRO Y CREDITO SAN FRANCISCO DE ASIS LT|
|---|---|
|0100|COOP. AHORRO Y CREDITO 15 DE ABRIL LTDA|
|0102|COOP. AHORRO Y CREDITO CARIAMANGA LTDA.|
|0103|COOP. AHORRO Y CREDITO PUELLARO LTDA|
|0105|COOP. DE A. Y C. 16 DE JUNIO|
|0107<br>|COOP. DE A. Y C. 23 DE MAYO LTDA.<br>|
|0108|COOP. DE A. Y C. MAQUITA CUSHUNCHIC LTDA.|
|0124|COOP. AHORRO Y CREDITO MANANTIAL DE ORO LTDA.|
|0125<br>|COOP. AHORRO Y CREDITO JUAN DE SALINAS LTDA.<br>|
|0126|COOP. AHORRO Y CREDITO NUEVA JERUSALEN|
|0129|COOP. AHORRO Y CREDITO AGRARIA MUSHUK KAWSAY LTDA.|
|0130|COOP. AHORRO Y CREDITO TENA LTDA.|
|0131|COOP. AHORRO Y CREDITO DE LA PEQUENA EMPRESA GUALA|
|0132|COOP. AHORRO Y CREDITO MI TIERRA|
|0133|COOP. DE AHORRO Y CREDITO DE LA PEQ. EMP. CACPE YA|
|0134|COOP. AHORRO Y CREDITO FUNDESARROLLO|
|0135|COOP. A Y C DE LA PEQ. EMP. CACPE ZAMORA LTDA.|
|0139|COOP. AHO Y CRED ALIANZA MINAS LTDA.|
|0143|COOPERATIVA 9 DE OCTUBRE LTDA|
|0144|COOPERATIVA CACPE BIBLIAN LTDA|
|0155|COOP. DE AH Y CR ONCE DE JUNIO|
|0161|COOP DE AH Y CR DE SERV PUBLIC MINISTERIO EDUC Y C|
|0168|COOP AH Y CR POLICIA NACIONAL|
|0183|BANCO D MIRO SA|
|0185|CoopAhyCr de la Pequena Empresa de Loja CACPE L|
|0187|COOP. DE AHORRO Y CREDITO SR. DE GIRON|
|0204|CoopAhyCredito Ambato Ltda|
|0205|COOPE AHO Y CRED PADRE JULIAN LORENTE LTDA|
|1015|DINERS/VISA INTERDIN/DISCOVER - Transferencias EnL|
|0214|COOP AHO Y CRED EDUCADORES DE CHIMBORAZO|
|0221|COOP DE AHO Y CRED SAN MIGUEL DE LOS BANCOS|
|0222<br>|COOP AH Y CR SAN ANTONIO LTDA.<br>|
|0229|COOP AH Y CRJUAN PIO MORA LTDA|
|0230|COOP AH Y CR EDUCADORES DE PASTAZA LTDA|
|0233|COOPE.CAMARA DE COMERCIO DE AMBATO|
|0257|COOP AH Y CR COCA LTDA|
|0263|COOP. DE AHORRO Y CREDITO MUSHUC RUNA LTDA.|
|0270|COOP AH Y CR CREDIAMIGO|
|0275|COOP. DE AHORRO Y CREDITO NUEVA HUANCAVILCA LTDA.|
|0291|COOP. DE AH Y CR LA INMACULADA DE SAN PLACIDO LTDA|
|0293|COOP. DE A Y C. LUZ DEL VALLE|
|0295|COOPERATIVA DE AHORRO Y CREDITO LA BENEFICA LTDA|
|0296|COOPERATIVA DE AHORRO Y CREDITO FERNANDO DAQUILEMA|
|0299|COOP  DE AHORRO Y CREDITO LA MERCED LTDA|
|0300|COOP. DE AHORRO Y CREDITO PEDRO MONCAYO LTDA.|
|0301|COOP. DE AHORRO Y CREDITO LOS ANDES LATINOS LTDA.|
|0302|COOP. DE A Y C GUAMOTE LTDA|
|0303|COOP. DE A. Y C. CREDISOCIO|
|0306|COOP. DE A. Y C. CAMARA DE COMERCIO SANTO DOMINGO|
|0308|COOP DE A Y CR CORPORACION CENTRO LTDA|
|0311|COOP AHORRO Y CREDITO SAN GABRIEL LTDA|
|0312|COOP AHORRO Y CREDI MUJERES UNIDAS TANTANAKUSHKA W|
|0313|COOPERATIVA DE AHORRO Y CREDITO ARTESANOS LTDA|
|0314|COOPERATIVA DE AHORRO Y CREDITO SANTA ANITA LTDA|
|<br>0315|<br>COOP. DE A. Y C. 13 DE ABRIL LTDA|
|0316<br>|COOP. DE AHORRO Y CREDITO PILAHUIN TIO LTDA.<br>|
|0318<br>0319|COOP. DE A. Y C. COOPAC AUSTRO LTDA -MIESS<br>COOPERATIVA DE AHORRO Y CREDITO CREA LTDA -MIES|





<!-- Start of picture text -->
0319  COOPERATIVA DE AHORRO Y CREDITO CREA LTDA -MIES<br><!-- End of picture text -->

|0320<br>0323|COOP. DE A. Y C. CHIBULEO LTDA.<br>COOP. DE AHORRO Y CREDITO 4 DE OCTUBRE LTDA.|
|---|---|
|0324|COOP AHORRO Y CREDITO SAN ISIDRO LTDA|
|0327<br>|COOP. AHORRO Y CREDITO SEMILLA DEL PROGRESO LTDA.<br>|
|0328|COOP. DE AHORRO Y CREDITO HUAICANA LTDA|
|0331|COOP. DE A. Y C. ABDON CALDERON LTDA.|
|0338<br>|COOPERATIVA DE AHORRO Y CREDITO PUCARA LTDA<br>|
|0341|COOPERATIVA DE AHORRO Y CREDITO MULTIEMPRESARIAL L|
|0342|COOP DE A Y C SAN JUAN DE COTOGCHOA|
|0353<br>|COOPERATIVA DE AHORRO Y CREDITO MINGA LTDA<br>|
|0354|COOP DE AH Y CR ERCO LTDA.|
|0355|COOP DE AHORRO Y CREDITO SANTA ISABEL LTDA|
|0359|COOP. DE A. Y C. LUCHA CAMPESINA LTDA.|
|0368|COOP AH Y CR ANDINA LTDA|
|0372|COOP DE AH Y CR NUEVA ESPERANZA|
|0373|COOP. DE AH Y CR FORTUNA - MIES|
|0395|COOP DE AHORRO Y CREDITO PROVIDA|
|0397|COOPERATIVA DE AHORRO Y CREDITO LAS LAGUNAS-MIESS|
|0404|COOP DE A Y C FUTURO LAMANENSE|
|0405|COOPERATIVA DE AHORO Y CREDITO VISION DE LOS ANDES|
|0406|COOP A Y C UNION EL EJIDO|
|0407|COOP A Y C VILCABAMBA CACVIL|
|0408|COOP A Y C CADECOG GONZANAMA|
|0426<br>|COOP. DE AHORRO Y CREDITO SAN MIGUEL DE PALLATANGA<br>|
|0431|COOP DE A Y C SANTA ANA DE NAYON|
|0432|COOP A Y C ESPERANZA Y PROGRESO DEL VALLE|
|0440|COOP. DE AH Y CR 1 DE JULIO|
|0446|COOP.DE AHORRO Y CREDITO MICROEMPRESARIAL SUCRE|
|0457|COOP. DE AH Y CR TEXTIL 14 DE MARZO|
|0066|BANECUADOR B.P.|
|0467|COOP. DE AH Y CR INDIGENA SAC LTDA|
|0470|COOP. DE AH Y CR FOCLA|
|0479<br>|COOP. DE AH Y CR SANTA LUCIA LTDA<br>|
|0486|COOP. DE AH Y CR CACPE CELICA|
|0064|BANCO COOPNACIONAL SA|
|0065|BANCO DESARROLLO DE LOS PUEBLOS S.A.|
|0487|COOP. DE AH Y CR CACEC LTDA. COTOPAXI|
|0488|COOP. DE AH Y CR MAGISTERIO MANABITA LIMITADA|
|0489|COOP. DE AH Y CR ALFONSO JARAMILLO C.C.C.|
|0498|COOP. DE AH Y CR PARA LA VIVIENDA ORDEN Y SEGURIDA|
|0506|COOP. DE AH Y CR VIRGEN DEL CISNE|
|0508|COOP. DE AH Y CR SANTA MARIA DE LA MANGA DEL CURA|
|0509|COOP. DE AH Y CR 16 DE JULIO LTDA|
|0510|COOP. DE AH Y CR METROPOLIS LTDA.|
|0511|COOP. DE AH. Y CR. SAN MARTIN DE TISALEO LTDA.|
|0512|COOP. DE AH Y CR EDUCADORES TULCAN LTDA|
|0513|COOP. DE AH Y CR EDUCADORES DE ZAMORA CHINCHIPE|
|0517|COOP. DE AH Y CR LIMITADA MIFEX|
|0520|COOP. DE AH Y CR SERVIDORES MUNICIPALES DE CUENCA|
|0522|COOP. DE AH Y CR EDUCADORES DE LOJA|
|0524<br>0525|COOP. DE AH Y CR GRAMEEN AMAZONAS<br>COOP DE AH Y CR PUERTO FRANCISCO DE ORELLANA|
|<br>0526|.<br>COOP. DE AH Y CR CAMARA DE COMERCIO JOYA DE LOS SA|
|0027|DELBANK|
|0529|COOP. DE AH Y CR PADRE VICENTE PONCE RUBIO|
|0533|COOP. DE AH Y CR ESPERANZA DEL FUTURO LTDA|
|0534|COOP. AH Y CR SUMAK KAWSAY|
|0535|COOP. AH Y CR VISIONFUND ECUADOR S. A.|
|0537|COOP. AH Y CR SAN ANTONIO LTDA. - IMBABURA(MIES)|





<!-- Start of picture text -->
0537  COOP. AH Y CR SAN ANTONIO LTDA. - IMBABURA (MIES)<br><!-- End of picture text -->

|0538|COOP DE AH Y CR ECUACREDITOS LTDA|
|---|---|
|0539|BANCO DEL INSTITUTO ECUATORIANO DE SEGURIDAD SOCIA|
|0550|COOP. DE AH Y CR SAN JOSE S.J.|
|0552|COOP. DE AH Y CR LA FLORESTA LTDA.|
|0554|COOP. DE AH Y CR SOL DE LOS ANDES LTDA.|
|0555|COOP. DE AH Y CR SIERRA CENTRO|
|0564|COOP. DE AH Y CR  ACCION IMBABURAPAK LTDA.|
|0567|COOP. DE AH Y CR KULLKI WASI LTDA.|
|0568|COOP. DE AH Y CR ACCION TUNGURAHUA LTDA|
|0589|CASA DE VALORES SMARTCAPITAL S. A. MV|
|0572|COOP. DE AH Y CR DON BOSCO|
|0573|COOP. DE AH Y CR VENCEDORES DE TUNGURAHUA|
|0575|COOP. DE AH Y CR FONDO PARA EL DESARROLLO Y LA VID|
|0576|COOP. DE AH Y CR 17 DE MARZO LTDA|
|0577|COOP. DE AH Y CR BASE DE TAURA|
|0578|COOP DE AH Y CR HERMES GAIBOR VERDESOTO|
|0579|COOPERATIVA DE AH Y CR CANAR LTDA.|
|0581|COOP. DE AH Y CR  MUSHUK - YUYAY(CANAR)|
|0582|COOP. DE AH Y CR EL MOLINO LTDA.|
|0583|COOP. DE AH Y CR PUSHAK RUNA HOMBRE LIDER|
|0585|COOP. DE AH Y CR OCCIDENTAL|
|0586|COOP. DE AH Y CR. SIMON BOLIVAR|
|0587|COOP. DE AH Y CR UNIBLOCK Y SERVICIOS LTDA.|
|0590|COOP AH Y CR DE INDIGENAS CHUCHUQUI LTDA|
|0591|COOP DE AH Y CR GANANSOL LTDA|
|0592|COOP AH Y CR CHUNCHI LTDA|
|0593|COOP DE AH Y CR NACIONAL LLANO GRANDE LTDA.|
|0594|COOP DE AH Y CR OBRAS PUBLICAS FISCALES DE LOJA Y|
|0595|COOP. DE AH Y CR FUTURO Y PROGRESO DE GALAPAGOS LT|
|0596|COOP. DE AH Y CR EDUC. DEL TUNGURAHUA LTDA.|
|0597|COOP DE AH Y CR SAN MIGUEL LTDA.|
|0598|COOP DE AH Y CR CREDI YA LTDA.|
|0602|COOP. DE AH Y CR CAMARA DE COMERCIO DEL CANTON BOL|
|0603|COOP. DE AH Y CR CASAG LTDA|
|0604|COOP. DE AH Y CR SANTA ROSA DE PATUTAN LTDA.|
|0605|COOP. DE AH Y CR LOS RIOS|
|0606|COOP. DE AH Y CR CREDISUR LTDA.|
|0610|COOP. DE AH Y CR FASAYNAN LTDA|
|0611|COOP. DE AH Y CR SAN JOSE EL AIRO|
|0613|COOP. DE AH Y CR SALINERITA|
|0615|COOP. DE AH Y CR DEL SINDICATO DE CHOFERES PROFESI|
|0616|COOP. DE AH Y CR UNIDAD Y PROGRESO|
|0617|COOP. DE AH Y CR RURAL SIERRA NORTE COOPRUSIENOR|
|0618|COOP. DE AH Y CR EL CALVARIO LTDA|















# Produbanco Vx 

En Pro de ti 





